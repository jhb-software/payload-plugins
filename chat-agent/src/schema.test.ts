import { describe, expect, it } from 'vitest'

import { buildSystemPrompt } from './schema.js'

describe('buildSystemPrompt', () => {
  it('includes default rules', () => {
    const prompt = buildSystemPrompt({ collections: [], globals: [] })
    expect(prompt).toContain('CMS content assistant')
    expect(prompt).toContain('confirm with the user')
    expect(prompt).toContain('find')
  })

  it('prepends custom prefix when provided', () => {
    const prompt = buildSystemPrompt(
      { collections: [], globals: [] },
      'You are a marketing assistant.',
    )
    expect(prompt.startsWith('You are a marketing assistant.')).toBe(true)
    // Should still include the default rules after
    expect(prompt).toContain('CMS content assistant')
  })

  it('includes collection schemas', () => {
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
    expect(prompt).toContain('### posts')
    expect(prompt).toContain('"title"')
    expect(prompt).toContain('"required": true')
    expect(prompt).toContain('### categories')
    expect(prompt).toContain('"name"')
  })

  it('includes global schemas', () => {
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
    expect(prompt).toContain('### settings')
    expect(prompt).toContain('"siteName"')
    expect(prompt).toContain('"logo"')
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

  it('extracts fields from layout wrappers (tabs, rows, collapsibles)', () => {
    const config = {
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              type: 'tabs',
              tabs: [
                {
                  fields: [{ name: 'title', type: 'text' }],
                  label: 'Content',
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'startDate', type: 'date' },
                { name: 'endDate', type: 'date' },
              ],
            },
          ],
        },
      ],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    // Fields should be hoisted from unnamed tabs and rows
    expect(prompt).toContain('"title"')
    expect(prompt).toContain('"startDate"')
    expect(prompt).toContain('"endDate"')
  })

  it('resolves block references from config.blocks', () => {
    const config = {
      blocks: [
        {
          slug: 'cta',
          fields: [{ name: 'buttonText', type: 'text' }],
        },
      ],
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blockReferences: ['cta'],
              blocks: [],
            },
          ],
        },
      ],
      globals: [],
    }

    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('"cta"')
    expect(prompt).toContain('"buttonText"')
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

    // Should not throw
    const prompt = buildSystemPrompt(config)
    expect(prompt).toContain('### empty')
    expect(prompt).toContain('### bare')
  })
})

// ---------------------------------------------------------------------------
// Mode-aware system prompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt with modes', () => {
  const minConfig = { collections: [], globals: [] }

  it('includes read-only instructions in read mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, undefined, 'read')
    expect(prompt).toContain('read-only mode')
    expect(prompt).toContain('only read content')
    expect(prompt).not.toContain('confirm with the user before creating')
  })

  it('includes ask mode instructions in ask mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, undefined, 'ask')
    expect(prompt).toContain('ask mode')
    expect(prompt).toContain('confirmation')
  })

  it('includes superuser instructions in superuser mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, undefined, 'superuser')
    expect(prompt).toContain('superuser mode')
    expect(prompt).toContain('bypassing normal user permissions')
  })

  it('includes standard rules in read-write mode', () => {
    const prompt = buildSystemPrompt(minConfig, undefined, undefined, 'read-write')
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
