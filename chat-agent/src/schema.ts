/**
 * Field-schema extraction from a Payload config.
 *
 * `extractFields` walks a field tree and produces a compact, JSON-serializable
 * shape suitable for inclusion in the agent's system prompt.
 */

/**
 * A label value that the agent can consume without an i18n runtime.
 *
 * Payload's raw `Label` type is `string | Record<string, string> | LabelFunction | false`.
 * Functions require `{ t, i18n }` which we don't have here, and `false` means
 * "no label" — both collapse to `undefined`.
 */
export type StaticLabel = Record<string, string> | string

/**
 * Normalize any Payload label value into a JSON-serializable static label.
 *
 * Accepts `string`, `Record<string, string>` (localized), `LabelFunction`, or
 * `false`. Functions and `false` return `undefined` since the agent-facing
 * schema has no i18n runtime to resolve them. Use this anywhere a Payload
 * label surfaces in the schema so all label shapes are handled consistently.
 */
export function normalizeLabel(raw: unknown): StaticLabel | undefined {
  if (typeof raw === 'string') {
    return raw
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, string>
  }
  return undefined
}

/**
 * Per-`richText`-field summary of the lexical editor's enabled features.
 *
 * Surfaces what the agent may emit when authoring content for this field.
 * Only feature keys actually present on the editor appear in `features`; the
 * `options` map carries typed projections for a curated allow-list of known
 * keys. Unknown keys appear in `features` without an `options` entry — the
 * agent knows they exist without the schema pretending to understand them.
 */
export interface LexicalFeatureSummary {
  /**
   * Feature keys present on this field's editor, sorted and deduped
   * (e.g. `['blocks', 'bold', 'heading', 'link']`).
   */
  features: string[]
  /** Per-feature option projections. Keys match feature keys. */
  options?: {
    blocks?: { slugs: string[] }
    heading?: { enabledHeadingSizes?: ('h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')[] }
    inlineBlocks?: { slugs: string[] }
    link?: {
      disabledCollections?: string[]
      enabledCollections?: string[]
      fields?: FieldSchema[]
    }
    relationship?: { disabledCollections?: string[]; enabledCollections?: string[] }
    upload?: { collections: string[] }
  }
}

export interface FieldSchema {
  blocks?: { fields: FieldSchema[]; slug: string }[]
  fields?: FieldSchema[]
  hasMany?: boolean
  lexical?: LexicalFeatureSummary
  localized?: boolean
  name: string
  options?: { label?: StaticLabel; value: string }[]
  relationTo?: string | string[]
  required?: boolean
  type: string
  virtual?: boolean
}

/** Loose structural representation of a Payload field for prompt building. */
type RawField = { [key: string]: unknown; type: string }

/** Loose structural representation of a Payload block. */
export interface RawBlock {
  fields?: readonly unknown[]
  interfaceName?: string
  labels?: { plural?: unknown; singular?: unknown }
  slug: string
}

/** Structural subset of `SanitizedConfig` used to build the system prompt. */
export interface PayloadConfigForPrompt {
  blocks?: readonly RawBlock[]
  collections?: readonly { fields?: readonly unknown[]; slug: string; upload?: unknown }[]
  globals?: readonly { fields?: readonly unknown[]; slug: string }[]
  localization?:
    | {
        defaultLocale: string
        locales: readonly ({ code: string } | string)[]
      }
    | false
  routes?: { admin?: string }
}

export function extractFields(
  fields: readonly unknown[],
  blocksBySlug: Record<string, RawBlock> = {},
): FieldSchema[] {
  const result: FieldSchema[] = []

  for (const rawField of fields) {
    const field = rawField as RawField
    // Tabs field: hoist unnamed tab fields, keep named tabs as nested
    if (field.type === 'tabs' && Array.isArray(field.tabs)) {
      for (const rawTab of field.tabs as unknown[]) {
        const tab = rawTab as { fields?: RawField[]; name?: string }
        if (tab.name) {
          // Named tab — behaves like a group
          result.push({
            name: tab.name,
            type: 'tab',
            fields: extractFields(tab.fields || [], blocksBySlug),
          })
        } else {
          // Unnamed tab — hoist fields to parent level
          result.push(...extractFields(tab.fields || [], blocksBySlug))
        }
      }
      continue
    }

    // Row / collapsible: unnamed layout wrappers — hoist their fields
    if (
      (field.type === 'row' || field.type === 'collapsible') &&
      !field.name &&
      Array.isArray(field.fields)
    ) {
      result.push(...extractFields(field.fields as RawField[], blocksBySlug))
      continue
    }

    if (!field.name || typeof field.name !== 'string') {
      continue
    }

    const schema: FieldSchema = {
      name: field.name,
      type: field.type,
    }

    if (field.required) {
      schema.required = true
    }
    if (field.localized) {
      schema.localized = true
    }
    if (field.virtual) {
      schema.virtual = true
    }
    if (field.hasMany) {
      schema.hasMany = true
    }
    if (field.relationTo) {
      schema.relationTo = field.relationTo as string | string[]
    }

    if (field.fields && Array.isArray(field.fields)) {
      schema.fields = extractFields(field.fields as RawField[], blocksBySlug)
    }

    // Resolve inline blocks + blockReferences (slugs pointing to config.blocks)
    const inlineBlocks: RawBlock[] =
      field.blocks && Array.isArray(field.blocks) ? (field.blocks as RawBlock[]) : []
    const refBlocks: RawBlock[] = Array.isArray(field.blockReferences)
      ? (field.blockReferences as ({ slug: string } | string)[])
          .map((blockRef) => {
            const slug = typeof blockRef === 'string' ? blockRef : blockRef.slug
            return blocksBySlug[slug]
          })
          .filter((b): b is RawBlock => Boolean(b))
      : []
    const allBlocks = [...inlineBlocks, ...refBlocks]

    if (allBlocks.length > 0) {
      schema.blocks = allBlocks.map((block) => ({
        slug: block.slug,
        fields: extractFields(block.fields || [], blocksBySlug),
      }))
    }

    if (field.options && Array.isArray(field.options)) {
      schema.options = (field.options as unknown[]).map((option) => {
        if (typeof option === 'string') {
          return { label: option, value: option }
        }
        const value = String((option as { value: unknown }).value)
        const label = normalizeLabel((option as { label: unknown }).label)
        return label === undefined ? { value } : { label, value }
      })
    }

    if (field.type === 'richText') {
      const lexical = extractLexicalSummary(field, blocksBySlug)
      if (lexical) {
        schema.lexical = lexical
      }
    }

    result.push(schema)
  }

  return result
}

/**
 * Normalize a lexical editor's features into `{ key, props }[]`.
 *
 * Payload's sanitized config exposes features under one of two shapes:
 *   1. `editor.features` — array of `{ key, serverFeatureProps?, clientFeatureProps?, props? }`
 *   2. `editor.resolvedFeatureMap` — `Map<key, { serverFeatureProps?, ... }>`
 *
 * Detection is purely structural so the extractor has no hard dependency on
 * `@payloadcms/richtext-lexical`. Returns `undefined` on unrecognised shapes
 * (never throws) so the caller can omit the `lexical` key entirely.
 */
function normalizeLexicalFeatures(
  editor: unknown,
): { key: string; props: Record<string, unknown> }[] | undefined {
  if (!editor || typeof editor !== 'object') {
    return undefined
  }
  const e = editor as { features?: unknown; resolvedFeatureMap?: unknown }

  const toProps = (entry: { props?: unknown; serverFeatureProps?: unknown }) => {
    const candidate = entry.serverFeatureProps ?? entry.props ?? {}
    return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : {}
  }

  if (Array.isArray(e.features)) {
    return (e.features as unknown[])
      .filter((f): f is { key: string } => {
        return Boolean(f && typeof f === 'object' && typeof (f as { key?: unknown }).key === 'string')
      })
      .map((f) => ({ key: f.key, props: toProps(f as Record<string, unknown>) }))
  }

  if (e.resolvedFeatureMap instanceof Map) {
    const entries: { key: string; props: Record<string, unknown> }[] = []
    for (const [key, value] of e.resolvedFeatureMap.entries()) {
      if (typeof key !== 'string') {
        continue
      }
      const props =
        value && typeof value === 'object' ? toProps(value as Record<string, unknown>) : {}
      entries.push({ key, props })
    }
    return entries
  }

  return undefined
}

/**
 * Build a `LexicalFeatureSummary` for a richText field.
 *
 * Walks the editor's features, sorts + dedupes their keys, and projects a
 * known allow-list of per-feature props into `options`. Unknown feature keys
 * appear in `features` with no `options` entry. Inline `Block` objects
 * declared on BlocksFeature / InlineBlocksFeature are registered into the
 * shared `blocksBySlug` so `getBlockSchema` can resolve them later — mirrors
 * how `extractFields` folds `blockReferences` into the same map.
 */
function extractLexicalSummary(
  field: RawField,
  blocksBySlug: Record<string, RawBlock>,
): LexicalFeatureSummary | undefined {
  const normalized = normalizeLexicalFeatures(field.editor)
  if (!normalized || normalized.length === 0) {
    return undefined
  }

  // Dedupe by key, keeping the first-seen props projection.
  const propsByKey = new Map<string, Record<string, unknown>>()
  for (const { key, props } of normalized) {
    if (!propsByKey.has(key)) {
      propsByKey.set(key, props)
    }
  }

  const features = [...propsByKey.keys()].sort()
  const options: NonNullable<LexicalFeatureSummary['options']> = {}

  for (const key of features) {
    const props = propsByKey.get(key) ?? {}
    const projection = projectFeatureOptions(key, props, blocksBySlug)
    if (projection !== undefined) {
      ;(options as Record<string, unknown>)[key] = projection
    }
  }

  const summary: LexicalFeatureSummary = { features }
  if (Object.keys(options).length > 0) {
    summary.options = options
  }
  return summary
}

/**
 * Project the props of a single feature into its typed `options` entry.
 *
 * Returns `undefined` when no known props are projectable so the caller can
 * skip adding an empty entry to `options`.
 */
function projectFeatureOptions(
  key: string,
  props: Record<string, unknown>,
  blocksBySlug: Record<string, RawBlock>,
): Record<string, unknown> | undefined {
  switch (key) {
    case 'blocks':
    case 'inlineBlocks': {
      const rawBlocks = props.blocks
      if (!Array.isArray(rawBlocks)) {
        return undefined
      }
      const slugs: string[] = []
      for (const entry of rawBlocks) {
        if (typeof entry === 'string') {
          slugs.push(entry)
        } else if (
          entry &&
          typeof entry === 'object' &&
          typeof (entry as { slug?: unknown }).slug === 'string'
        ) {
          const block = entry as RawBlock
          slugs.push(block.slug)
          if (!(block.slug in blocksBySlug)) {
            blocksBySlug[block.slug] = block
          }
        }
      }
      return slugs.length > 0 ? { slugs } : undefined
    }

    case 'heading': {
      const sizes = props.enabledHeadingSizes
      if (Array.isArray(sizes) && sizes.every((s) => typeof s === 'string')) {
        return { enabledHeadingSizes: sizes }
      }
      return undefined
    }

    case 'link': {
      const result: Record<string, unknown> = {}
      const enabled = toStringArray(props.enabledCollections)
      if (enabled) {
        result.enabledCollections = enabled
      }
      const disabled = toStringArray(props.disabledCollections)
      if (disabled) {
        result.disabledCollections = disabled
      }
      if (Array.isArray(props.fields)) {
        result.fields = extractFields(props.fields as RawField[], blocksBySlug)
      }
      return Object.keys(result).length > 0 ? result : undefined
    }

    case 'relationship': {
      const result: Record<string, unknown> = {}
      const enabled = toStringArray(props.enabledCollections)
      if (enabled) {
        result.enabledCollections = enabled
      }
      const disabled = toStringArray(props.disabledCollections)
      if (disabled) {
        result.disabledCollections = disabled
      }
      return Object.keys(result).length > 0 ? result : undefined
    }

    case 'upload': {
      const collections = props.collections
      if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
        return undefined
      }
      return { collections: Object.keys(collections as Record<string, unknown>) }
    }

    default:
      return undefined
  }
}

/**
 * Return the input when it is a `string[]`, otherwise `undefined`. Preserves
 * empty arrays — an empty `enabledCollections` is meaningful ("disables every
 * collection") and should surface as-is.
 */
function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  if (value.every((v) => typeof v === 'string')) {
    return value
  }
  return undefined
}
