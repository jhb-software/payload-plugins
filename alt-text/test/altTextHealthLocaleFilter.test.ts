import assert from 'node:assert/strict'

import type { PayloadRequest } from 'payload'

import { describe, test } from 'vitest'

import type { AltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'
import type { AltTextHealthScan } from '../src/utilities/altTextHealth.ts'
import type { AltTextHealthCacheFactory } from '../src/utilities/altTextHealthCache.ts'

import { getAltTextHealthScan } from '../src/utilities/altTextHealth.ts'

/**
 * The health report measures each request against the locales it serves. A tenant
 * serving only German must not be reported as permanently incomplete because the
 * project also configures English — a state no editor of it can fix.
 */

type Doc = { alt: Record<string, string>; id: string; mimeType: string; tenant: string }

const DOCS: Doc[] = [
  { id: 'a1', alt: { de: 'Ein Foto', en: 'A photo' }, mimeType: 'image/png', tenant: 'acme' },
  { id: 'g1', alt: { de: 'Ein Foto', en: '' }, mimeType: 'image/png', tenant: 'globex' },
  { id: 'g2', alt: { de: '', en: '' }, mimeType: 'image/png', tenant: 'globex' },
]

/** Records every query the scan issues, so the cache's effect is observable. */
function createPayload() {
  const queries: { tenant: unknown }[] = []

  const payload = {
    collections: {},
    config: {
      custom: {},
      localization: { defaultLocale: 'en', localeCodes: ['en', 'de'] },
    },
    find: ({ where }: { where: Record<string, any> }) => {
      const tenantConstraint = (where.and ?? []).find(
        (clause: Record<string, unknown>) => 'tenant' in clause,
      )
      const tenant = tenantConstraint?.tenant?.equals
      queries.push({ tenant })

      return Promise.resolve({
        docs: DOCS.filter((doc) => !tenant || doc.tenant === tenant),
        hasNextPage: false,
      })
    },
    logger: { error: () => {} },
  }

  return { payload, queries }
}

/** Behavioural stand-in for `unstable_cache`, memoizing on the joined key parts. */
function createCacheFactory(): AltTextHealthCacheFactory<AltTextHealthScan> {
  const entries = new Map<string, Promise<AltTextHealthScan>>()

  return (compute, cacheKeyParts) => () => {
    const key = cacheKeyParts.join('|')
    const cached = entries.get(key)

    if (cached) {
      return cached
    }

    const pending = compute()
    entries.set(key, pending)

    return pending
  }
}

function createRequest(
  payload: ReturnType<typeof createPayload>['payload'],
  {
    filterLocales,
    tenant,
  }: { filterLocales?: AltTextPluginConfig['filterLocales']; tenant: string },
): PayloadRequest {
  payload.config.custom = {
    altTextPluginConfig: {
      collections: [{ slug: 'images', mimeTypes: ['image/*'] }],
      filterLocales,
      healthCheck: true,
      healthCheckBaseFilter: () => ({ tenant: { equals: tenant } }),
      locales: ['en', 'de'],
    },
  }

  // `i18n` present so the scan's detached request does not build one from config.
  return { i18n: {}, payload } as unknown as PayloadRequest
}

const imagesOf = (scan: AltTextHealthScan) =>
  scan.collections.find((entry) => entry.collection === 'images')!

describe('filterLocales (health report)', () => {
  test('measures a document against the locales the filter admits', async () => {
    const { payload } = createPayload()

    const scan = await getAltTextHealthScan(
      createRequest(payload, { filterLocales: () => ['de'], tenant: 'globex' }),
      createCacheFactory(),
    )

    // `g1` has German alt text only, which is everything Globex serves.
    assert.equal(imagesOf(scan).completeDocs, 1)
    assert.equal(imagesOf(scan).partialDocs, 0)
    assert.equal(imagesOf(scan).missingDocs, 1)
    assert.deepEqual(imagesOf(scan).invalidDocIds, ['g2'])
    assert.deepEqual(scan.localeCodes, ['de'])
  })

  test('counts the same document as partial against every configured locale', async () => {
    const { payload } = createPayload()

    const scan = await getAltTextHealthScan(
      createRequest(payload, { tenant: 'globex' }),
      createCacheFactory(),
    )

    assert.equal(imagesOf(scan).completeDocs, 0)
    assert.equal(imagesOf(scan).partialDocs, 1)
  })

  test('does not serve one locale scope’s cached scan to another', async () => {
    const cacheFactory = createCacheFactory()
    const { payload, queries } = createPayload()

    const globex = await getAltTextHealthScan(
      createRequest(payload, { filterLocales: () => ['de'], tenant: 'globex' }),
      cacheFactory,
    )
    const acme = await getAltTextHealthScan(
      createRequest(payload, { filterLocales: () => ['en', 'de'], tenant: 'acme' }),
      cacheFactory,
    )

    assert.equal(imagesOf(globex).completeDocs, 1)
    assert.equal(imagesOf(acme).completeDocs, 1)
    assert.equal(queries.length, 2)
  })

  test('reports a throwing filter as a scan error instead of failing the request', async () => {
    const { payload } = createPayload()

    const scan = await getAltTextHealthScan(
      createRequest(payload, {
        filterLocales: () => {
          throw new Error('tenant cookie points at a deleted tenant')
        },
        tenant: 'acme',
      }),
      createCacheFactory(),
    )

    assert.equal(scan.collections.length, 0)
    assert.equal(scan.errors.length, 1)
    assert.equal(scan.errors[0].code, 'ALT_TEXT_LOCALES_FILTER_FAILED')
    assert.match(scan.errors[0].message, /deleted tenant/)
  })

  test('reports a filter returning an unconfigured locale as a scan error', async () => {
    const { payload } = createPayload()

    const scan = await getAltTextHealthScan(
      createRequest(payload, { filterLocales: () => ['fr'], tenant: 'acme' }),
      createCacheFactory(),
    )

    assert.equal(scan.collections.length, 0)
    assert.equal(scan.errors[0].code, 'ALT_TEXT_LOCALES_FILTER_FAILED')
    assert.match(scan.errors[0].message, /fr/)
  })
})
