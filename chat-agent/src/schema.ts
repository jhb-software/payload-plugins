/**
 * System prompt generation from Payload config.
 *
 * Includes `extractFields` to build a schema-aware system prompt
 * so the agent knows the data model.
 */

import type { DiscoverableEndpoint } from './tools.js'

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

export function extractFields(
  fields: any[],
  blocksBySlug: Record<string, any> = {},
): FieldSchema[] {
  const result: FieldSchema[] = []

  for (const field of fields) {
    // Tabs field: hoist unnamed tab fields, keep named tabs as nested
    if (field.type === 'tabs' && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
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
      result.push(...extractFields(field.fields, blocksBySlug))
      continue
    }

    if (!field.name) {
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
      schema.relationTo = field.relationTo
    }

    if (field.fields && Array.isArray(field.fields)) {
      schema.fields = extractFields(field.fields, blocksBySlug)
    }

    // Resolve inline blocks + blockReferences (slugs pointing to config.blocks)
    const inlineBlocks: any[] = field.blocks && Array.isArray(field.blocks) ? field.blocks : []
    const refBlocks: any[] = Array.isArray(field.blockReferences)
      ? field.blockReferences
          .map((blockRef: any) => {
            const slug = typeof blockRef === 'string' ? blockRef : blockRef.slug
            return blocksBySlug[slug]
          })
          .filter(Boolean)
      : []
    const allBlocks = [...inlineBlocks, ...refBlocks]

    if (allBlocks.length > 0) {
      schema.blocks = allBlocks.map((block: any) => ({
        slug: block.slug,
        fields: extractFields(block.fields || [], blocksBySlug),
      }))
    }

    if (field.options && Array.isArray(field.options)) {
      schema.options = field.options.map((option: any) =>
        typeof option === 'string'
          ? { label: option, value: option }
          : { label: option.label, value: option.value },
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
 */
export function buildSystemPrompt(
  payloadConfig: any,
  customPrefix?: string,
  customEndpoints?: DiscoverableEndpoint[],
): string {
  const sections: string[] = []

  if (customPrefix) {
    sections.push(customPrefix)
  }

  const adminRoute = payloadConfig.routes?.admin ?? '/admin'

  sections.push(
    'You are a CMS content assistant with access to the Payload CMS database.',
    'You can read and write content using the provided tools.',
    '',
    '## Rules',
    '- Always confirm with the user before creating, updating, or deleting documents.',
    '- Use `find` or `findByID` to look up data before making changes.',
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
  const blocksBySlug: Record<string, any> = {}
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

  // Localization
  if (payloadConfig.localization) {
    const locales = (payloadConfig.localization.locales as any[]).map((l: any) =>
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
