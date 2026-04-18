import { describe, expect, it } from 'vitest'

import { buildSystemPrompt } from './system-prompt.js'

describe('buildSystemPrompt', () => {
  it('includes default rules', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).toContain('CMS content assistant')
    expect(prompt).toContain('confirm with the user')
  })

  it('prepends custom prefix when provided', () => {
    const prompt = buildSystemPrompt(
      { collections: [], globals: [] },
      'You are a marketing assistant.',
    )
    expect(prompt.startsWith('You are a marketing assistant.')).toBe(true)
    expect(prompt).toContain('CMS content assistant')
  })

  it('lists collection slugs only, not their fields', () => {
    const config = {
      collections: [
        {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'body', type: 'richText' },
          ],
        },
        {
          slug: 'categories',
          fields: [{ name: 'name', type: 'text' }],
        },
      ],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('## Collections')
    expect(prompt).toContain('posts')
    expect(prompt).toContain('categories')
    // Field details must NOT leak into the prompt — agent fetches them via
    // getCollectionSchema on demand.
    expect(prompt).not.toContain('"title"')
    expect(prompt).not.toContain('"required": true')
    expect(prompt).not.toContain('richText')
  })

  it('lists global slugs only, not their fields', () => {
    const config = {
      collections: [],
      globals: [
        {
          slug: 'settings',
          fields: [
            { name: 'siteName', type: 'text' },
            { name: 'logo', type: 'upload', relationTo: 'media' },
          ],
        },
      ],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('## Globals')
    expect(prompt).toContain('settings')
    expect(prompt).not.toContain('"siteName"')
    expect(prompt).not.toContain('"logo"')
  })

  it('tells the agent how to inspect field details on demand', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).toContain('getCollectionSchema')
    expect(prompt).toContain('getGlobalSchema')
  })

  it('mentions listBlocks / getBlockSchema only when config.blocks is non-empty', () => {
    const withBlocks = buildSystemPrompt({
      blocks: [{ slug: 'hero', fields: [] }],
      collections: [],
      globals: [],
    })
    expect(withBlocks).toContain('listBlocks')
    expect(withBlocks).toContain('getBlockSchema')

    const emptyBlocks = buildSystemPrompt({ blocks: [], collections: [], globals: [] })
    expect(emptyBlocks).not.toContain('listBlocks')
    expect(emptyBlocks).not.toContain('getBlockSchema')

    const noBlocks = buildSystemPrompt({ collections: [], globals: [] })
    expect(noBlocks).not.toContain('listBlocks')
    expect(noBlocks).not.toContain('getBlockSchema')
  })

  it('notes that Payload uses Lexical for rich text', () => {
    // The agent needs to know rich-text field values are Lexical editor state
    // (JSON tree), not HTML or Markdown, so it writes/reads them correctly.
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).toContain('Lexical')
  })

  it('distinguishes the `draft` query flag from the `_status` field', () => {
    // The agent was conflating the two: `draft` selects the versions vs main
    // table (a "latest" flag); `_status` holds the actual draft/published
    // state of the document.
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).toContain('`draft`')
    expect(prompt).toContain('`_status`')
  })

  it('mentions listEndpoints only when custom endpoints exist', () => {
    const withEndpoints = buildSystemPrompt({ collections: [], globals: [] }, undefined, true)
    expect(withEndpoints).toContain('listEndpoints')

    const withoutEndpoints = buildSystemPrompt({ collections: [], globals: [] })
    expect(withoutEndpoints).not.toContain('listEndpoints')
  })

  it('does not dump endpoint paths/descriptions into the prompt', () => {
    // Endpoints live behind listEndpoints now — the prompt only signals that
    // they exist. Agent pays one round trip to see them.
    const prompt = buildSystemPrompt({ collections: [], globals: [] }, undefined, true)
    expect(prompt).not.toContain('## Custom Endpoints')
  })

  it('includes localization info when present', () => {
    const config = {
      collections: [],
      globals: [],
      localization: {
        defaultLocale: 'en',
        locales: [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'German' },
        ],
      },
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('## Localization')
    expect(prompt).toContain('en, de')
    expect(prompt).toContain('Default locale: en')
  })

  it('handles string locales', () => {
    const config = {
      collections: [],
      globals: [],
      localization: {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'de'],
      },
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('en, fr, de')
  })

  it('omits localization section when not configured', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).not.toContain('## Localization')
  })

  it('omits collections section when empty', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).not.toContain('## Collections')
  })

  it('omits globals section when empty', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).not.toContain('## Globals')
  })

  it('includes admin panel URL patterns so the agent can link documents', () => {
    const prompt = buildSystemPrompt({
      collections: [{ slug: 'posts', fields: [] }],
      globals: [{ slug: 'settings', fields: [] }],
    })
    expect(prompt).toContain('Admin Panel')
    expect(prompt).toContain('/admin/collections/')
    expect(prompt).toContain('/admin/globals/')
  })

  it('uses the custom admin route prefix from config.routes.admin', () => {
    const prompt = buildSystemPrompt({
      collections: [{ slug: 'posts', fields: [] }],
      globals: [],
      routes: { admin: '/cms' },
    })
    expect(prompt).toContain('/cms/collections/')
    expect(prompt).not.toContain('/admin/collections/')
  })

  it('handles missing fields gracefully', () => {
    const config = {
      collections: [{ slug: 'empty' }],
      globals: [{ slug: 'bare' }],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('empty')
    expect(prompt).toContain('bare')
  })

  it('keeps the prompt small regardless of schema size', () => {
    // A prompt built from a large schema (many collections with deeply
    // nested fields) should stay within a modest size bound because fields
    // are not inlined — only slugs are.
    const manyFields = Array.from({ length: 50 }, (_, i) => ({
      name: `field${i}`,
      type: 'text',
      required: true,
    }))
    const config = {
      collections: Array.from({ length: 20 }, (_, i) => ({
        slug: `col${i}`,
        fields: manyFields,
      })),
      globals: Array.from({ length: 5 }, (_, i) => ({
        slug: `global${i}`,
        fields: manyFields,
      })),
    }

    const prompt = buildSystemPrompt(config)
    // 20 collections × 50 fields inlined as JSON would be ~40 KB. The
    // slug-catalog version should be a small fraction of that.
    expect(prompt.length).toBeLessThan(5000)
  })
})

// ---------------------------------------------------------------------------
// Mode-aware system prompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt with modes', () => {
  const minConfig = { collections: [], globals: [] }

  it('includes read-only instructions in read mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, false, 'read')
    expect(prompt).toContain('read-only mode')
    expect(prompt).toContain('only read content')
    expect(prompt).not.toContain('confirm with the user before creating')
  })

  it('includes ask mode instructions in ask mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, false, 'ask')
    expect(prompt).toContain('ask mode')
    expect(prompt).toContain('confirmation')
  })

  it('includes superuser instructions in superuser mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, false, 'superuser')
    expect(prompt).toContain('superuser mode')
    expect(prompt).toContain('bypassing normal user permissions')
  })

  it('includes standard rules in read-write mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, false, 'read-write')
    expect(prompt).toContain('confirm with the user before creating')
  })

  it('includes standard rules when no mode specified', () => {
    const prompt = buildSystemPrompt(minConfig)
    expect(prompt).toContain('confirm with the user before creating')
  })
})

// ---------------------------------------------------------------------------
// Upload collections in system prompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt with upload collections', () => {
  it('includes file upload instructions when upload collections exist', () => {
    const config = {
      collections: [
        { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
        { slug: 'media', fields: [{ name: 'alt', type: 'text' }], upload: true },
      ],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('## File Uploads')
    expect(prompt).toContain('media')
    expect(prompt).toContain('/admin/collections/media')
  })

  it('lists multiple upload collections', () => {
    const config = {
      collections: [
        { slug: 'media', fields: [], upload: true },
        { slug: 'documents', fields: [], upload: { staticDir: 'docs' } },
      ],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('media')
    expect(prompt).toContain('documents')
  })

  it('omits file upload section when no upload collections exist', () => {
    const config = {
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).not.toContain('## File Uploads')
  })

  it('uses custom admin route in upload collection links', () => {
    const config = {
      collections: [{ slug: 'media', fields: [], upload: true }],
      globals: [],
      routes: { admin: '/cms' },
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('/cms/collections/media')
    expect(prompt).not.toContain('/admin/collections/media')
  })
})
