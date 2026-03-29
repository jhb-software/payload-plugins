import assert from 'node:assert/strict'
import test from 'node:test'

import { createCachedAltTextHealthScan } from '../src/utilities/altTextHealthCache.ts'
import {
  mapAltTextHealthScanToContract,
  mapAltTextHealthScanToWidgetData,
} from '../src/utilities/altTextHealthContract.ts'
import { getAltTextHealthWidgetDisplayState } from '../src/utilities/altTextHealthWidgetDisplay.ts'

const TTL_SECONDS = 3600

test('maps valid coverage gaps to an unhealthy contract', () => {
  const contract = mapAltTextHealthScanToContract(
    {
      checkedAt: new Date().toISOString(),
      collections: [
        {
          collection: 'media',
          completeDocs: 3,
          invalidDocIds: ['1', '2'],
          missingDocs: 1,
          partialDocs: 1,
          totalDocs: 5,
        },
      ],
      errors: [],
      isLocalized: true,
      localeCodes: ['en', 'de'],
    },
    { ttlSeconds: TTL_SECONDS },
  )

  assert.equal(contract.status, 'unhealthy')
  assert.equal(contract.summary.collectionCount, 1)
  assert.equal(contract.summary.checkedCollectionCount, 1)
  assert.equal(contract.summary.failedCollectionCount, 0)
  assert.equal(contract.summary.invalidDocs, 2)
  assert.equal(contract.summary.localeCount, 2)
  assert.equal(contract.details.collections[0]?.status, 'unhealthy')
})

test('maps collection read failures to a degraded contract and preserves drilldown separation', () => {
  const checkedAt = new Date().toISOString()
  const widgetData = mapAltTextHealthScanToWidgetData(
    {
      checkedAt,
      collections: [
        {
          collection: 'media',
          completeDocs: 0,
          error: {
            code: 'ALT_TEXT_COLLECTION_READ_FAILED',
            collection: 'media',
            message: 'Database timeout',
            operation: 'find',
          },
          invalidDocIds: undefined,
          missingDocs: 0,
          partialDocs: 0,
          totalDocs: 0,
        },
      ],
      errors: [
        {
          code: 'ALT_TEXT_COLLECTION_READ_FAILED',
          collection: 'media',
          message: 'Database timeout',
          operation: 'find',
        },
      ],
      isLocalized: false,
      localeCodes: [],
    },
    { ttlSeconds: TTL_SECONDS },
  )

  assert.equal(widgetData.contract.status, 'degraded')
  assert.equal(widgetData.contract.summary.checkedCollectionCount, 0)
  assert.equal(widgetData.contract.summary.failedCollectionCount, 1)
  assert.equal(widgetData.contract.details.collections[0]?.status, 'degraded')
  assert.equal(widgetData.collections[0]?.error?.code, 'ALT_TEXT_COLLECTION_READ_FAILED')
  assert.ok(!('invalidDocIds' in widgetData.contract.details.collections[0]!))
})

test('maps missing plugin config to an unknown contract', () => {
  const contract = mapAltTextHealthScanToContract(
    {
      checkedAt: new Date().toISOString(),
      collections: [],
      errors: [
        {
          code: 'ALT_TEXT_PLUGIN_CONFIG_MISSING',
          message: 'Alt text plugin config not found',
        },
      ],
      isLocalized: false,
      localeCodes: [],
    },
    { ttlSeconds: TTL_SECONDS },
  )

  assert.equal(contract.status, 'unknown')
  assert.equal(contract.summary.collectionCount, 0)
  assert.equal(contract.summary.totalDocs, 0)
})

test('marks stale results when checkedAt exceeds the TTL window', () => {
  const contract = mapAltTextHealthScanToContract(
    {
      checkedAt: new Date(Date.now() - (TTL_SECONDS + 5) * 1000).toISOString(),
      collections: [],
      errors: [],
      isLocalized: false,
      localeCodes: [],
    },
    { ttlSeconds: TTL_SECONDS },
  )

  assert.equal(contract.freshness.state, 'stale')
  assert.equal(contract.status, 'healthy')
})

test('treats collection read failures as unavailable instead of healthy in the widget', () => {
  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: {
        code: 'ALT_TEXT_COLLECTION_READ_FAILED',
        collection: 'media',
        message: 'Database timeout',
        operation: 'find',
      },
      invalidDocCount: 0,
    }),
    'unavailable',
  )

  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: undefined,
      invalidDocCount: 2,
    }),
    'unhealthy',
  )

  assert.equal(
    getAltTextHealthWidgetDisplayState({
      error: undefined,
      invalidDocCount: 0,
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
