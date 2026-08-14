import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { AltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { generateAltTextEndpoint } from '../src/endpoints/generateAltText.ts'
import { buildEndpointRequest, buildPluginConfig } from './support/endpointHarness.ts'

/**
 * What `getImageThumbnail` delivers has to reach the resolver: providers that
 * inline image bytes (Anthropic image blocks, Gemini `inline_data`) require an
 * explicit media type and cannot sniff it from a URL. And because signed CDN
 * URLs are routine, `getImageThumbnail` has to be allowed to be async.
 */

type ResolveArgs = { imageThumbnailMimeType?: string; imageThumbnailUrl: string }

function buildRecordingConfig(overrides: Partial<AltTextPluginConfig> = {}): {
  pluginConfig: AltTextPluginConfig
  resolveCalls: ResolveArgs[]
} {
  const resolveCalls: ResolveArgs[] = []

  const record = (args: ResolveArgs) => {
    resolveCalls.push({
      imageThumbnailMimeType: args.imageThumbnailMimeType,
      imageThumbnailUrl: args.imageThumbnailUrl,
    })
  }

  const pluginConfig = buildPluginConfig({
    resolver: {
      key: 'mock',
      resolve: async (args) => {
        record(args)
        return { success: true, result: { altText: 'generated alt', keywords: ['a'] } }
      },
      resolveBulk: async (args) => {
        record(args)
        return { success: true, results: { en: { altText: 'generated alt', keywords: ['a'] } } }
      },
    },
    ...overrides,
  })

  return { pluginConfig, resolveCalls }
}

describe('declared thumbnail mime type reaches the resolver', () => {
  test('passes the collection’s declared type to the single-image resolver', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig({
      collections: [
        { slug: 'media', mimeTypes: ['image/*'], imageThumbnailMimeType: 'image/webp' },
      ],
    })
    const { req } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: false },
      { pluginConfig },
    )

    const response = await generateAltTextEndpoint(pluginConfig.access)(req)

    assert.equal(response.status, 200)
    assert.equal(resolveCalls[0]?.imageThumbnailMimeType, 'image/webp')
  })

  test('passes the declared type to the bulk resolver', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig({
      collections: [
        { slug: 'media', mimeTypes: ['image/*'], imageThumbnailMimeType: 'image/webp' },
      ],
    })
    const { req } = buildEndpointRequest({ ids: ['doc-1'], collection: 'media' }, { pluginConfig })

    await bulkGenerateAltTextsEndpoint(pluginConfig.access)(req)

    assert.equal(resolveCalls[0]?.imageThumbnailMimeType, 'image/webp')
  })

  test('leaves it undefined when the collection declares nothing, so the resolver falls back to sniffing', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig()
    const { req } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: false },
      { pluginConfig },
    )

    const response = await generateAltTextEndpoint(pluginConfig.access)(req)

    assert.equal(response.status, 200)
    assert.equal(resolveCalls.length, 1)
    assert.equal(resolveCalls[0]?.imageThumbnailMimeType, undefined)
  })
})

describe('declared thumbnail mime type replaces the stored-format check', () => {
  // The reason the option exists: the resolver never sees the AVIF bytes, only
  // the transcoded thumbnail, so the stored format must stop deciding.
  test('generates for a source format the resolver rejects when a delivered type is declared', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig({
      collections: [
        { slug: 'media', mimeTypes: ['image/*'], imageThumbnailMimeType: 'image/webp' },
      ],
    })
    pluginConfig.resolver.supportedMimeTypes = ['image/jpeg', 'image/webp']
    const { req, updateCalls } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: true },
      { doc: { mimeType: 'image/avif' }, pluginConfig },
    )

    const response = await generateAltTextEndpoint(pluginConfig.access)(req)

    assert.equal(response.status, 200)
    assert.equal(resolveCalls.length, 1)
    assert.equal(updateCalls.length, 1)
  })

  test('still rejects that source format when nothing is declared', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig()
    pluginConfig.resolver.supportedMimeTypes = ['image/jpeg', 'image/webp']
    const { req } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: true },
      { doc: { mimeType: 'image/avif' }, pluginConfig },
    )

    const response = await generateAltTextEndpoint(pluginConfig.access)(req)

    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /not supported for files of type "image\/avif"/)
    assert.equal(resolveCalls.length, 0)
  })
})

describe('async getImageThumbnail', () => {
  test('awaits a promise-returning getImageThumbnail before calling the resolver', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig({
      getImageThumbnail: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return 'https://cdn.example.com/signed/thumb.webp?sig=abc'
      },
    })
    const { req } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: false },
      { pluginConfig },
    )

    const response = await generateAltTextEndpoint(pluginConfig.access)(req)

    assert.equal(response.status, 200)
    assert.equal(
      resolveCalls[0]?.imageThumbnailUrl,
      'https://cdn.example.com/signed/thumb.webp?sig=abc',
    )
  })

  test('awaits it in the bulk endpoint too', async () => {
    const { pluginConfig, resolveCalls } = buildRecordingConfig({
      getImageThumbnail: async () => 'https://cdn.example.com/signed/bulk.webp?sig=abc',
    })
    const { req } = buildEndpointRequest({ ids: ['doc-1'], collection: 'media' }, { pluginConfig })

    await bulkGenerateAltTextsEndpoint(pluginConfig.access)(req)

    assert.equal(
      resolveCalls[0]?.imageThumbnailUrl,
      'https://cdn.example.com/signed/bulk.webp?sig=abc',
    )
  })
})
