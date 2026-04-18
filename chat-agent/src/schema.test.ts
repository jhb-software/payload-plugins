import { describe, expect, it } from 'vitest'

import type { RawBlock } from './schema.js'

import { extractFields, normalizeLabel } from './schema.js'

describe('normalizeLabel', () => {
  it('returns plain strings unchanged', () => {
    expect(normalizeLabel('Hotel')).toBe('Hotel')
  })

  it('returns localized label objects unchanged', () => {
    expect(normalizeLabel({ de: 'Sonstige', en: 'Other' })).toEqual({
      de: 'Sonstige',
      en: 'Other',
    })
  })

  it('returns undefined for LabelFunction values (cannot resolve without i18n)', () => {
    const labelFn = ({ t }: { t: (k: string) => string }) => t('fields:other')
    expect(normalizeLabel(labelFn)).toBeUndefined()
  })

  it('returns undefined for `false` (explicitly-hidden label)', () => {
    expect(normalizeLabel(false)).toBeUndefined()
  })

  it('returns undefined for null / undefined', () => {
    expect(normalizeLabel(null)).toBeUndefined()
    expect(normalizeLabel(undefined)).toBeUndefined()
  })

  it('does not treat arrays as localized-label records', () => {
    expect(normalizeLabel(['a', 'b'])).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Lexical feature surfacing (plan 013)
// ---------------------------------------------------------------------------

/**
 * Build a minimal sanitized `richText` field where `editor.features` is the
 * array form Payload surfaces after sanitization. Each feature entry carries a
 * `key` and optional `serverFeatureProps`.
 */
function richTextField(
  name: string,
  features: { key: string; serverFeatureProps?: Record<string, unknown> }[],
) {
  return {
    name,
    type: 'richText',
    editor: { features },
  }
}

describe('extractFields — lexical feature summary', () => {
  it('surfaces enabled feature keys sorted and deduped', () => {
    const [field] = extractFields([
      richTextField('body', [
        { key: 'bold' },
        { key: 'italic' },
        { key: 'heading' },
        { key: 'link' },
        { key: 'bold' }, // duplicate — should collapse
      ]),
    ])
    expect(field.lexical?.features).toEqual(['bold', 'heading', 'italic', 'link'])
  })

  it('surfaces heading.enabledHeadingSizes when provided', () => {
    const [field] = extractFields([
      richTextField('body', [
        { key: 'heading', serverFeatureProps: { enabledHeadingSizes: ['h2', 'h3'] } },
      ]),
    ])
    expect(field.lexical?.options?.heading?.enabledHeadingSizes).toEqual(['h2', 'h3'])
  })

  it('omits heading.enabledHeadingSizes when not provided and does not infer a default', () => {
    const [field] = extractFields([richTextField('body', [{ key: 'heading' }])])
    expect(field.lexical?.features).toContain('heading')
    // No inferred default list; either options.heading is absent or lacks enabledHeadingSizes
    expect(field.lexical?.options?.heading?.enabledHeadingSizes).toBeUndefined()
  })

  it('surfaces link.fields when the sanitized shape is an array', () => {
    const [field] = extractFields([
      richTextField('body', [
        { key: 'link', serverFeatureProps: { fields: [{ name: 'rel', type: 'text' }] } },
      ]),
    ])
    expect(field.lexical?.options?.link?.fields).toEqual([{ name: 'rel', type: 'text' }])
  })

  it('omits link.fields when still a callback', () => {
    const [field] = extractFields([
      richTextField('body', [
        { key: 'link', serverFeatureProps: { fields: () => [{ name: 'rel', type: 'text' }] } },
      ]),
    ])
    expect(field.lexical?.options?.link?.fields).toBeUndefined()
  })

  it('surfaces link.enabledCollections and disabledCollections when present', () => {
    const [field] = extractFields([
      richTextField('body', [
        {
          key: 'link',
          serverFeatureProps: {
            disabledCollections: ['media'],
            enabledCollections: ['posts', 'pages'],
          },
        },
      ]),
    ])
    expect(field.lexical?.options?.link?.enabledCollections).toEqual(['posts', 'pages'])
    expect(field.lexical?.options?.link?.disabledCollections).toEqual(['media'])
  })

  it('surfaces upload.collections as a slug array', () => {
    const [field] = extractFields([
      richTextField('body', [
        {
          key: 'upload',
          serverFeatureProps: { collections: { docs: {}, media: {} } },
        },
      ]),
    ])
    expect(field.lexical?.options?.upload?.collections).toEqual(['docs', 'media'])
  })

  it('omits upload options when collections is missing or not an object', () => {
    const [field] = extractFields([
      richTextField('body', [{ key: 'upload', serverFeatureProps: {} }]),
    ])
    expect(field.lexical?.features).toContain('upload')
    expect(field.lexical?.options?.upload).toBeUndefined()
  })

  it('surfaces blocks.slugs and registers inline Block objects into blocksBySlug', () => {
    const blocksBySlug: Record<string, RawBlock> = {}
    const [field] = extractFields(
      [
        richTextField('body', [
          {
            key: 'blocks',
            serverFeatureProps: {
              blocks: [
                { slug: 'hero', fields: [{ name: 'headline', type: 'text' }] },
                'callToAction',
              ],
            },
          },
        ]),
      ],
      blocksBySlug,
    )
    expect(field.lexical?.options?.blocks?.slugs).toEqual(['hero', 'callToAction'])
    expect(blocksBySlug.hero).toBeDefined()
    expect(blocksBySlug.hero.slug).toBe('hero')
  })

  it('surfaces inlineBlocks.slugs and registers inline Block objects into blocksBySlug', () => {
    const blocksBySlug: Record<string, RawBlock> = {}
    const [field] = extractFields(
      [
        richTextField('body', [
          {
            key: 'inlineBlocks',
            serverFeatureProps: {
              blocks: [
                { slug: 'mention', fields: [{ name: 'user', type: 'text' }] },
                'emoji',
              ],
            },
          },
        ]),
      ],
      blocksBySlug,
    )
    expect(field.lexical?.options?.inlineBlocks?.slugs).toEqual(['mention', 'emoji'])
    expect(blocksBySlug.mention).toBeDefined()
  })

  it('surfaces relationship.enabledCollections and disabledCollections when present', () => {
    const [field] = extractFields([
      richTextField('body', [
        {
          key: 'relationship',
          serverFeatureProps: {
            disabledCollections: ['drafts'],
            enabledCollections: ['posts'],
          },
        },
      ]),
    ])
    expect(field.lexical?.options?.relationship?.enabledCollections).toEqual(['posts'])
    expect(field.lexical?.options?.relationship?.disabledCollections).toEqual(['drafts'])
  })

  it('lists unknown feature keys in features without adding an options entry', () => {
    const [field] = extractFields([
      richTextField('body', [
        { key: 'myThing', serverFeatureProps: { weird: 'stuff' } },
        { key: 'bold' },
      ]),
    ])
    expect(field.lexical?.features).toContain('myThing')
    expect(
      (field.lexical?.options as Record<string, unknown> | undefined)?.myThing,
    ).toBeUndefined()
  })

  it('omits the lexical key when the richText editor is absent', () => {
    const [field] = extractFields([{ name: 'body', type: 'richText' }])
    expect(field.lexical).toBeUndefined()
  })

  it('omits the lexical key when the editor exposes no features/resolvedFeatureMap', () => {
    const [field] = extractFields([{ name: 'body', type: 'richText', editor: {} }])
    expect(field.lexical).toBeUndefined()
  })

  it('does not add a lexical key to non-richText fields', () => {
    const fields = extractFields([
      { name: 'title', type: 'text' },
      { name: 'tags', type: 'array', fields: [{ name: 'v', type: 'text' }] },
      { name: 'layout', type: 'blocks', blocks: [{ slug: 'hero', fields: [] }] },
      {
        name: 'meta',
        type: 'tabs',
        tabs: [{ name: 'seo', fields: [{ name: 'title', type: 'text' }] }],
      },
    ])
    for (const field of fields) {
      expect(field.lexical).toBeUndefined()
      // Recurse into nested fields so `tabs`, `array`, `blocks` children are checked too
      for (const nested of field.fields ?? []) {
        expect(nested.lexical).toBeUndefined()
      }
    }
  })

  it('falls back to resolvedFeatureMap when editor.features is absent', () => {
    const resolvedFeatureMap = new Map<string, { serverFeatureProps?: Record<string, unknown> }>([
      ['bold', {}],
      ['heading', { serverFeatureProps: { enabledHeadingSizes: ['h1', 'h2'] } }],
    ])
    const [field] = extractFields([
      {
        name: 'body',
        type: 'richText',
        editor: { resolvedFeatureMap },
      },
    ])
    expect(field.lexical?.features).toEqual(['bold', 'heading'])
    expect(field.lexical?.options?.heading?.enabledHeadingSizes).toEqual(['h1', 'h2'])
  })
})
