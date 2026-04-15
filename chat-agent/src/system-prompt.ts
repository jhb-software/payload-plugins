/**
 * System prompt generation for the chat agent.
 *
 * Builds a schema-aware prompt from the Payload config so the agent knows
 * the data model, available endpoints, and mode-specific behavioral rules.
 */

import type { DiscoverableEndpoint } from './tools.js'
import type { AgentMode } from './types.js'

import { extractFields, type PayloadConfigForPrompt, type RawBlock } from './schema.js'

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
