import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import type { AltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'

/**
 * The bulk endpoint bounds and de-duplicates the `ids` array so a single
 * request cannot fan out into an unbounded number of paid resolver calls.
 */

const user = { id: 'user-1', email: 'user@example.com', role: 'user' }

function buildPluginConfig(maxBulkGenerateIds: number): AltTextPluginConfig {
  return {
    access: ({ req }) => !!req.user,
    collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
    enabled: true,
    getImageThumbnail: () => 'https://example.com/thumb.png',
    healthCheck: true,
    healthCheckAccess: ({ req }) => !!req.user,
    locale: 'en',
    locales: [],
    maxBulkGenerateConcurrency: 1,
    maxBulkGenerateIds,
    resolver: {
      key: 'mock',
      resolve: async () => ({
        success: true,
        result: { altText: 'generated alt', keywords: ['a', 'b'] },
      }),
      resolveBulk: async () => ({
        success: true,
        results: { en: { altText: 'generated alt', keywords: ['a', 'b'] } },
      }),
    },
  }
}

function buildRequest(
  body: unknown,
  maxBulkGenerateIds: number,
): { req: PayloadRequest; resolveBulkIds: (number | string)[] } {
  const pluginConfig = buildPluginConfig(maxBulkGenerateIds)
  const resolveBulkIds: (number | string)[] = []

  const req = {
    json: async () => body,
    payload: {
      config: { custom: { altTextPluginConfig: pluginConfig } },
      findByID: async (args: { id: number | string }) => {
        resolveBulkIds.push(args.id)
        return { id: args.id, filename: 'photo.png', mimeType: 'image/png' }
      },
      update: async (args: { id: number | string }) => ({ id: args.id }),
    },
    user,
  } as unknown as PayloadRequest

  return { req, resolveBulkIds }
}

describe('bulk generate ids limit', () => {
  test('rejects a batch larger than the configured maximum without generating anything', async () => {
    const { req, resolveBulkIds } = buildRequest({ collection: 'media', ids: ['a', 'b', 'c'] }, 2)

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig(2).access)(req)

    assert.equal(response.status, 400)
    assert.equal(resolveBulkIds.length, 0)
  })

  test('collapses duplicate ids so each image is generated only once', async () => {
    const { req, resolveBulkIds } = buildRequest({ collection: 'media', ids: ['a', 'a', 'b'] }, 100)

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig(100).access)(req)
    const result = (await response.json()) as { totalDocs: number; updatedDocs: number }

    assert.deepEqual([...resolveBulkIds].sort(), ['a', 'b'])
    assert.equal(result.totalDocs, 2)
    assert.equal(result.updatedDocs, 2)
  })

  test('counts deduplicated ids against the limit, not the raw array length', async () => {
    // Six raw ids but only two distinct — must pass a limit of 2.
    const { req, resolveBulkIds } = buildRequest(
      { collection: 'media', ids: ['a', 'a', 'a', 'b', 'b', 'b'] },
      2,
    )

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig(2).access)(req)

    assert.equal(response.status, 200)
    assert.deepEqual([...resolveBulkIds].sort(), ['a', 'b'])
  })
})
