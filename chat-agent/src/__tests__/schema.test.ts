import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../schema.js'

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
        locales: [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'German' },
        ],
        defaultLocale: 'en',
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
        locales: ['en', 'fr', 'de'],
        defaultLocale: 'en',
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
                  label: 'Content',
                  fields: [{ name: 'title', type: 'text' }],
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
              blocks: [],
              blockReferences: ['cta'],
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
