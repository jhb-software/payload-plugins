/**
 * System prompt generation from Payload config.
 *
 * Includes `extractFields` to build a schema-aware system prompt
 * so the agent knows the data model.
 */

import type { DiscoverableEndpoint } from './tools.js'
import type { AgentMode } from './types.js'

// ---------------------------------------------------------------------------
// Field extraction (self-contained, no dependency on payload)
// ---------------------------------------------------------------------------

interface FieldSchema {
  blocks?: { fields: FieldSchema[]; slug: string }[]
  fields?: FieldSchema[]
  hasMany?: boolean
  localized?: boolean
  name: string
  options?: { label: string; value: string }[]
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
      schema.options = (field.options as unknown[]).map((option) =>
        typeof option === 'string'
          ? { label: option, value: option }
          : {
              label: String((option as { label: unknown }).label),
              value: String((option as { value: unknown }).value),
            },
      )
    }

    result.push(schema)
  }

  return result
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the chat agent.
 *
 * @param payloadConfig    The Payload runtime config (`req.payload.config`)
 * @param customPrefix     Optional user-provided text prepended to the prompt
 * @param customEndpoints  Discoverable custom endpoints to list for the agent
 * @param mode             Current agent mode (affects behavioral instructions)
 */
export function buildSystemPrompt(
  payloadConfig: PayloadConfigForPrompt,
  customPrefix?: string,
  customEndpoints?: DiscoverableEndpoint[],
  mode?: AgentMode,
): string {
  const sections: string[] = []

  if (customPrefix) {
    sections.push(customPrefix)
  }

  const adminRoute = payloadConfig.routes?.admin ?? '/admin'

  sections.push(
    'You are a CMS content assistant with access to the Payload CMS database.',
    ...(mode === 'read'
      ? ['You can only read content — you have no write tools available.']
      : ['You can read and write content using the provided tools.']),
    '',
    '## Rules',
    ...(mode === 'read'
      ? [
          '- You are in **read-only mode**. Do not suggest or attempt write operations.',
          '- Use `find`, `findByID`, `count`, or `findGlobal` to look up data.',
        ]
      : mode === 'ask'
        ? [
            '- You are in **ask mode**. Write operations (create, update, delete) require explicit user confirmation before they execute.',
            '- When you call a write tool, the user will be shown a confirmation dialog before it runs.',
            '- Use `find` or `findByID` to look up data before making changes.',
          ]
        : mode === 'superuser'
          ? [
              '- You are in **superuser mode** with full access to the database, bypassing normal user permissions.',
              '- Always confirm with the user before creating, updating, or deleting documents.',
              '- Use `find` or `findByID` to look up data before making changes.',
            ]
          : [
              '- Always confirm with the user before creating, updating, or deleting documents.',
              '- Use `find` or `findByID` to look up data before making changes.',
            ]),
    '- When showing results, format them clearly. Summarize large result sets.',
    '- If a query returns no results, say so clearly.',
    "- Respect that your actions are limited by the current user's permissions.",
    '- If a tool call fails with a permission error, tell the user they lack access.',
    '',
    '## Token efficiency',
    '- Always use `select` to request only the fields you need. Never fetch all fields when you only need a few.',
    '- Keep `depth` at 0 (the default) unless you specifically need populated relationship data. Depth 0 returns relationship IDs only.',
    '- Use `limit` to fetch only as many documents as needed.',
    '- For listing/browsing, select only summary fields (e.g. id, title, slug, status) first, then fetch full details with findByID only when needed.',
    '',
    '## Admin Panel Links',
    `When referencing a document (after create/update/find), render it as a markdown link to its admin page so the user can open it. Use the title as the label, ID as fallback. Patterns (relative URLs): \`${adminRoute}/collections/<slug>/<id>\`, \`${adminRoute}/collections/<slug>\`, \`${adminRoute}/globals/<slug>\`.`,
  )

  // Collections
  const blocksBySlug: Record<string, RawBlock> = {}
  for (const block of payloadConfig.blocks ?? []) {
    blocksBySlug[block.slug] = block
  }

  const collections = payloadConfig.collections ?? []
  if (collections.length > 0) {
    sections.push('', '## Collections')
    for (const col of collections) {
      const fields = extractFields(col.fields ?? [], blocksBySlug)
      sections.push('', `### ${col.slug}`, '```json', JSON.stringify(fields, null, 2), '```')
    }
  }

  const globals = payloadConfig.globals ?? []
  if (globals.length > 0) {
    sections.push('', '## Globals')
    for (const global of globals) {
      const fields = extractFields(global.fields ?? [], blocksBySlug)
      sections.push('', `### ${global.slug}`, '```json', JSON.stringify(fields, null, 2), '```')
    }
  }

  // Upload collections
  const uploadCollections = collections.filter((col) => col.upload)
  if (uploadCollections.length > 0) {
    const uploadSlugs = uploadCollections.map((col) => col.slug)
    sections.push(
      '',
      '## File Uploads',
      'You cannot upload files through this chat. If a user wants to upload files, images, or media, instruct them to upload directly in the corresponding upload-enabled collection in the admin panel. Once uploaded, you can reference and use those files.',
      '',
      `Upload-enabled collections: ${uploadSlugs.map((slug) => `[\`${slug}\`](${adminRoute}/collections/${slug})`).join(', ')}`,
    )
  }

  // Localization
  if (payloadConfig.localization) {
    const locales = payloadConfig.localization.locales.map((l) =>
      typeof l === 'string' ? l : l.code,
    )
    sections.push(
      '',
      '## Localization',
      `Locales: ${locales.join(', ')}`,
      `Default locale: ${payloadConfig.localization.defaultLocale}`,
      'Use the `locale` parameter in tool calls to read/write localized fields.',
    )
  }

  // Custom endpoints
  if (customEndpoints && customEndpoints.length > 0) {
    sections.push(
      '',
      '## Custom Endpoints',
      'These endpoints can be invoked with the `callEndpoint` tool. Use the exact path and method shown.',
      '',
    )
    for (const ep of customEndpoints) {
      sections.push(`- **${ep.method.toUpperCase()} ${ep.path}** — ${ep.description}`)
    }
  }

  return sections.join('\n')
}
