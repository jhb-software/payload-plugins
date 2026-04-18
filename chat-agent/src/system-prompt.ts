/**
 * System prompt generation for the chat agent.
 *
 * The prompt carries a lightweight slug catalog so the agent knows what
 * collections, globals, and endpoints exist. Field-level details (types,
 * required, block structure) are fetched on demand via the
 * `getCollectionSchema` / `getGlobalSchema` / `listEndpoints` tools — keeping
 * the prompt small even for configs with many collections.
 */

import type { FieldSchema, PayloadConfigForPrompt, RawBlock } from './schema.js'
import type { AgentMode } from './types.js'

import { extractFields } from './schema.js'

/**
 * Whether any `richText` field across the passed schemas carries at least one
 * detectable lexical feature. Used to gate the rich-text feature-guidance
 * bullet so the agent is not instructed to inspect `lexical.*` metadata that
 * isn't there.
 */
function anyRichTextHasLexicalFeatures(fieldGroups: FieldSchema[][]): boolean {
  const hasFeatures = (fields: FieldSchema[]): boolean => {
    for (const field of fields) {
      if (
        field.type === 'richText' &&
        field.lexical &&
        field.lexical.features.length > 0
      ) {
        return true
      }
      if (field.fields && hasFeatures(field.fields)) {
        return true
      }
      if (field.blocks) {
        for (const block of field.blocks) {
          if (hasFeatures(block.fields)) {
            return true
          }
        }
      }
    }
    return false
  }
  return fieldGroups.some(hasFeatures)
}

/**
 * Build the system prompt for the chat agent.
 *
 * @param payloadConfig        The Payload runtime config (`req.payload.config`)
 * @param customPrefix         Optional user-provided text prepended to the prompt
 * @param hasCustomEndpoints   Whether `listEndpoints` is available — controls
 *                             whether to mention it in the rules
 * @param mode                 Current agent mode (affects behavioral instructions)
 */
export function buildSystemPrompt(
  payloadConfig: PayloadConfigForPrompt,
  customPrefix?: string,
  hasCustomEndpoints = false,
  mode?: AgentMode,
): string {
  const sections: string[] = []

  if (customPrefix) {
    sections.push(customPrefix)
  }

  const adminRoute = payloadConfig.routes?.admin ?? '/admin'

  // Build a shared block registry so inline blocks surfaced through lexical
  // features (BlocksFeature / InlineBlocksFeature) stay reachable when the
  // rich-text feature-guidance bullet is gated.
  const blocksBySlug: Record<string, RawBlock> = {}
  for (const block of payloadConfig.blocks ?? []) {
    blocksBySlug[block.slug] = block
  }
  const collectionSchemas = (payloadConfig.collections ?? []).map((c) =>
    extractFields(c.fields ?? [], blocksBySlug),
  )
  const globalSchemas = (payloadConfig.globals ?? []).map((g) =>
    extractFields(g.fields ?? [], blocksBySlug),
  )
  const hasLexicalFeatures = anyRichTextHasLexicalFeatures([
    ...collectionSchemas,
    ...globalSchemas,
  ])

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
    '- Call `getCollectionSchema({ slug })` or `getGlobalSchema({ slug })` to inspect field details before querying, filtering, or writing. Only the slugs are listed below — field names and types are fetched on demand.',
    ...((payloadConfig.blocks?.length ?? 0) > 0
      ? [
          "- Call `listBlocks` to see globally-declared blocks, and `getBlockSchema({ slug })` to inspect a block's fields before inserting it into a `blocks` field.",
        ]
      : []),
    ...(hasLexicalFeatures
      ? [
          "- For every `richText` field in a schema, inspect `lexical.features` and `lexical.options` to see which node types you may emit. Only produce nodes whose feature key appears in `features`. For `blocks` / `inlineBlocks`, the slugs in `options.blocks.slugs` / `options.inlineBlocks.slugs` are exhaustive — call `getBlockSchema({ slug })` to inspect a block's fields before composing it.",
        ]
      : []),
    ...(hasCustomEndpoints
      ? [
          '- Call `listEndpoints` to see plugin-provided custom endpoints that can be invoked via `callEndpoint`.',
        ]
      : []),
    '- When showing results, format them clearly. Summarize large result sets.',
    '- If a query returns no results, say so clearly.',
    "- Respect that your actions are limited by the current user's permissions.",
    '- If a tool call fails with a permission error, tell the user they lack access.',
    '- Payload uses [Lexical](https://lexical.dev) for rich text fields — their values are Lexical editor JSON state, not HTML or Markdown.',
    "- Drafts: for versioned collections, the `draft` flag selects which table is read from or written to — the versions table (drafts) or the main collection table (published); it acts as a \"latest version\" flag and relaxes required-field validation on writes. The document's actual status lives in the `_status` field, with values `'draft'` or `'published'`.",
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

  // Slug catalog — collections
  const collections = payloadConfig.collections ?? []
  if (collections.length > 0) {
    sections.push('', '## Collections', collections.map((c) => c.slug).join(', '))
  }

  // Slug catalog — globals
  const globals = payloadConfig.globals ?? []
  if (globals.length > 0) {
    sections.push('', '## Globals', globals.map((g) => g.slug).join(', '))
  }

  // Upload collections (stays inline — small, always needed to know where
  // users upload media).
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

  // Localization (stays inline — small, needed to pick `locale` on tool calls).
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

  return sections.join('\n')
}
