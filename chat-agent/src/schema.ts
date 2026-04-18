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

interface FieldSchema {
  blocks?: { fields: FieldSchema[]; slug: string }[]
  fields?: FieldSchema[]
  hasMany?: boolean
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

    result.push(schema)
  }

  return result
}
