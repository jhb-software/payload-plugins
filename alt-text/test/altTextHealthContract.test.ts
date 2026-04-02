import assert from 'node:assert/strict'
import test from 'node:test'

import { createCachedAltTextHealthScan } from '../src/utilities/altTextHealthCache.ts'
import { getAltTextHealthWidgetDisplayState } from '../src/utilities/altTextHealthWidgetDisplay.ts'

const TTL_SECONDS = 3600

test('treats collection read failures as unavailable instead of healthy in the widget', () => {
  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: {
        code: 'ALT_TEXT_COLLECTION_READ_FAILED',
        collection: 'media',
        message: 'Database timeout',
        operation: 'find',
      },
      missingDocs: 0,
      partialDocs: 0,
    }),
    'unavailable',
  )

  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: undefined,
      missingDocs: 1,
      partialDocs: 1,
    }),
    'unhealthy',
  )

  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: undefined,
      missingDocs: 0,
      partialDocs: 0,
    }),
    'healthy',
  )
})

test('builds the cache wrapper without serializing payload-like arguments', async () => {
  let cachedInvocationArgs: unknown[] | undefined

  const getCachedScan = createCachedAltTextHealthScan({
    cacheFactory: (compute, keyParts, options) => {
      assert.deepEqual(keyParts, ['alt-text-health', 'images', 'en'])
      assert.equal(options?.revalidate, TTL_SECONDS)
      assert.deepEqual(options?.tags, ['alt-text-health', 'alt-text-health:images'])

      return async (...args: unknown[]) => {
        cachedInvocationArgs = args
        return compute()
      }
    },
    cacheKeyParts: ['alt-text-health', 'images', 'en'],
    compute: async () => 'ok',
    revalidate: TTL_SECONDS,
    tags: ['alt-text-health', 'alt-text-health:images'],
  })

  const result = await getCachedScan()

  assert.equal(result, 'ok')
  assert.deepEqual(cachedInvocationArgs, [])
})
