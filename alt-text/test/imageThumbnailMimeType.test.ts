import type { Config, Field } from 'payload'

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { IncomingAltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { payloadAltTextPlugin } from '../src/plugin.ts'
import { normalizeCollectionsConfig } from '../src/utilities/mimeTypes.ts'

// `getImageThumbnail` may transcode the image (e.g. a Cloudinary `f_webp`
// transformation), in which case the stored `mimeType` says nothing about the
// format the resolver actually receives. `imageThumbnailMimeType` declares the
// delivered format, which is validated once at config load and then replaces the
// per-document source check.

const baseConfig = () =>
  ({
    collections: [
      { slug: 'media', fields: [], upload: true },
      { slug: 'documents', fields: [], upload: true },
    ],
  }) as unknown as Config

const resolver: IncomingAltTextPluginConfig['resolver'] = {
  key: 'mock',
  resolve: async () => ({ success: true, result: { altText: 'a', keywords: [] } }),
  resolveBulk: async () => ({ success: true, results: {} }),
  supportedMimeTypes: ['image/jpeg', 'image/webp'],
}

const pluginConfig = (
  overrides: Partial<IncomingAltTextPluginConfig>,
): IncomingAltTextPluginConfig => ({
  collections: ['media'],
  getImageThumbnail: () => 'https://example.com/thumb.webp',
  locale: 'en',
  resolver,
  ...overrides,
})

const altFieldOf = (config: Config, slug: string) => {
  const collection = config.collections?.find((entry) => entry.slug === slug)
  return collection?.fields.find((field: Field) => 'name' in field && field.name === 'alt') as
    undefined | { admin?: { custom?: Record<string, unknown> } }
}

describe('normalizeCollectionsConfig — imageThumbnailMimeType resolution', () => {
  test('applies the plugin-level default to bare slugs', () => {
    const result = normalizeCollectionsConfig(['media'], { imageThumbnailMimeType: 'image/webp' })

    assert.equal(result[0]!.imageThumbnailMimeType, 'image/webp')
  })

  test('applies the plugin-level default to object entries that omit it', () => {
    const result = normalizeCollectionsConfig([{ slug: 'media', mimeTypes: ['image/*'] }], {
      imageThumbnailMimeType: 'image/webp',
    })

    assert.equal(result[0]!.imageThumbnailMimeType, 'image/webp')
  })

  test('lets a collection override the plugin-level default', () => {
    const result = normalizeCollectionsConfig(
      [{ slug: 'media', imageThumbnailMimeType: 'image/jpeg' }],
      { imageThumbnailMimeType: 'image/webp' },
    )

    assert.equal(result[0]!.imageThumbnailMimeType, 'image/jpeg')
  })

  test('`null` opts a collection out of the plugin-level default', () => {
    const result = normalizeCollectionsConfig(
      ['media', { slug: 'documents', imageThumbnailMimeType: null }],
      { imageThumbnailMimeType: 'image/webp' },
    )

    assert.equal(result[0]!.imageThumbnailMimeType, 'image/webp')
    assert.equal(result[1]!.imageThumbnailMimeType, undefined)
  })

  test('omits the key entirely when neither level declares one', () => {
    const result = normalizeCollectionsConfig(['media'])

    assert.equal('imageThumbnailMimeType' in result[0]!, false)
  })
})

describe('imageThumbnailMimeType — config load validation', () => {
  test('throws when the declared type is not supported by the resolver', () => {
    assert.throws(
      () =>
        payloadAltTextPlugin(pluginConfig({ imageThumbnailMimeType: 'image/avif' }))(baseConfig()),
      /imageThumbnailMimeType "image\/avif".*does not support it/s,
    )
  })

  test('throws when a per-collection declaration is not supported by the resolver', () => {
    assert.throws(
      () =>
        payloadAltTextPlugin(
          pluginConfig({ collections: [{ slug: 'media', imageThumbnailMimeType: 'image/avif' }] }),
        )(baseConfig()),
      /"media" collection/,
    )
  })

  test('accepts a declared type the resolver supports', () => {
    assert.doesNotThrow(() =>
      payloadAltTextPlugin(pluginConfig({ imageThumbnailMimeType: 'image/webp' }))(baseConfig()),
    )
  })

  test('skips validation for a collection that opted out', () => {
    assert.doesNotThrow(() =>
      payloadAltTextPlugin(
        pluginConfig({
          collections: [{ slug: 'media', imageThumbnailMimeType: null }],
          imageThumbnailMimeType: 'image/webp',
        }),
      )(baseConfig()),
    )
  })

  test('accepts any well-formed declared type when the resolver declares no supported types', () => {
    assert.doesNotThrow(() =>
      payloadAltTextPlugin(
        pluginConfig({
          imageThumbnailMimeType: 'image/avif',
          resolver: { ...resolver, supportedMimeTypes: undefined },
        }),
      )(baseConfig()),
    )
  })

  // Declaring a type switches off the per-document source check, so a typo that
  // boots cleanly is the worst outcome: the guard is gone and the declaration
  // silently means nothing. The shape check has to run even when there is no
  // resolver list to compare against.
  test('rejects a malformed type even when the resolver declares no supported types', () => {
    assert.throws(
      () =>
        payloadAltTextPlugin(
          pluginConfig({
            imageThumbnailMimeType: 'image-webp',
            resolver: { ...resolver, supportedMimeTypes: undefined },
          }),
        )(baseConfig()),
      /is not a valid MIME type/,
    )
  })

  test('rejects an empty declared type rather than silently ignoring it', () => {
    assert.throws(
      () =>
        payloadAltTextPlugin(
          pluginConfig({
            collections: [{ slug: 'media', imageThumbnailMimeType: '' }],
            resolver: { ...resolver, supportedMimeTypes: undefined },
          }),
        )(baseConfig()),
      /is not a valid MIME type/,
    )
  })
})

describe('imageThumbnailMimeType — admin button gating', () => {
  test('drops the client-side mime type gate for collections that declare a delivered type', () => {
    const config = payloadAltTextPlugin(pluginConfig({ imageThumbnailMimeType: 'image/webp' }))(
      baseConfig(),
    )

    assert.equal(altFieldOf(config, 'media')?.admin?.custom?.supportedMimeTypes, undefined)
  })

  test('keeps the gate per collection when only some declare a delivered type', () => {
    const config = payloadAltTextPlugin(
      pluginConfig({
        collections: ['media', { slug: 'documents', imageThumbnailMimeType: null }],
        imageThumbnailMimeType: 'image/webp',
      }),
    )(baseConfig())

    assert.equal(altFieldOf(config, 'media')?.admin?.custom?.supportedMimeTypes, undefined)
    assert.deepEqual(altFieldOf(config, 'documents')?.admin?.custom?.supportedMimeTypes, [
      'image/jpeg',
      'image/webp',
    ])
  })

  test('keeps the gate when nothing is declared', () => {
    const config = payloadAltTextPlugin(pluginConfig({}))(baseConfig())

    assert.deepEqual(altFieldOf(config, 'media')?.admin?.custom?.supportedMimeTypes, [
      'image/jpeg',
      'image/webp',
    ])
  })
})

describe('getImageThumbnail collection argument', () => {
  test('is typed so an existing single-argument function still assigns', () => {
    const config: IncomingAltTextPluginConfig = pluginConfig({
      getImageThumbnail: (doc) => String(doc.url),
    })

    assert.equal(typeof config.getImageThumbnail, 'function')
  })
})
