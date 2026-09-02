import assert from 'node:assert/strict'

import type { PayloadRequest, Where } from 'payload'

import { describe, test } from 'vitest'

import type { AltTextHealthScan } from '../src/utilities/altTextHealth.ts'
import type { AltTextHealthCacheFactory } from '../src/utilities/altTextHealthCache.ts'

import { getAltTextHealthScan } from '../src/utilities/altTextHealth.ts'

/**
 * `healthCheck.baseFilter` narrows the scan, which runs with `overrideAccess: true`
 * and is shared through the cache. Both halves matter: the query has to be narrowed,
 * and the cache entry has to be narrowed with it — otherwise one tenant is served
 * another tenant's counts.
 */

type Doc = { alt: unknown; id: string; mimeType: string; tenant?: string }

const DOCS: Record<string, Doc[]> = {
  'shared-media': [
    { id: 's1', alt: '', mimeType: 'image/png' },
    { id: 's2', alt: 'A shared logo', mimeType: 'image/png' },
  ],
  images: [
    { id: 'a1', alt: '', mimeType: 'image/png', tenant: 'acme' },
    { id: 'a2', alt: 'An Acme photo', mimeType: 'image/png', tenant: 'acme' },
    { id: 'a3', alt: '', mimeType: 'video/mp4', tenant: 'acme' },
    { id: 'g1', alt: '', mimeType: 'image/png', tenant: 'globex' },
  ],
}

function matches(doc: Doc, where: Where): boolean {
  return Object.entries(where).every(([key, constraint]) => {
    if (key === 'and') {
      return (constraint as Where[]).every((clause) => matches(doc, clause))
    }
    if (key === 'or') {
      return (constraint as Where[]).some((clause) => matches(doc, clause))
    }

    const value = doc[key as keyof Doc]
    const operators = constraint as Record<string, unknown>

    if ('equals' in operators) {
      return value === operators.equals
    }
    if ('in' in operators) {
      return (operators.in as unknown[]).includes(value)
    }
    if ('like' in operators) {
      return typeof value === 'string' && value.startsWith(operators.like as string)
    }

    throw new Error(`Unsupported operator in test matcher: ${JSON.stringify(operators)}`)
  })
}

/** Records every query the scan issues, so the cache's effect is observable. */
function createPayload() {
  const queries: { collection: string; where: Where }[] = []

  const payload = {
    collections: {},
    config: {
      custom: {},
      localization: undefined,
    },
    find: ({ collection, where }: { collection: string; where: Where }) => {
      queries.push({ collection, where })
      const docs = (DOCS[collection] ?? []).filter((doc) => matches(doc, where))

      return Promise.resolve({ docs, hasNextPage: false })
    },
    logger: { error: () => {} },
  }

  return { payload, queries }
}

/**
 * Behavioural stand-in for `unstable_cache`: memoizes on the joined key parts, which
 * is the property the scan relies on for correctness across requests.
 */
function createCacheFactory(): AltTextHealthCacheFactory<AltTextHealthScan> {
  const entries = new Map<string, Promise<AltTextHealthScan>>()

  return (compute, cacheKeyParts) => {
    return () => {
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
}

function createRequest(
  payload: ReturnType<typeof createPayload>['payload'],
  baseFilter?: (args: { collection: string; req: PayloadRequest }) => Promise<Where> | Where,
): PayloadRequest {
  payload.config.custom = {
    altTextPluginConfig: {
      collections: [
        { slug: 'images', mimeTypes: ['image/*'] },
        { slug: 'shared-media', mimeTypes: ['image/*'] },
      ],
      healthCheck: true,
      healthCheckBaseFilter: baseFilter,
      locale: 'en',
    },
  }

  return { payload } as unknown as PayloadRequest
}

const countsFor = (scan: AltTextHealthScan, collection: string) =>
  scan.collections.find((entry) => entry.collection === collection)!

describe('healthCheck.baseFilter', () => {
  test('counts only the documents the filter admits', async () => {
    const { payload } = createPayload()
    const req = createRequest(payload, () => ({ tenant: { equals: 'acme' } }))

    const scan = await getAltTextHealthScan(req, createCacheFactory())

    const images = countsFor(scan, 'images')
    assert.equal(images.totalDocs, 2)
    assert.equal(images.missingDocs, 1)
    assert.deepEqual(images.invalidDocIds, ['a1'])
  })

  test('scans every document when no filter is configured', async () => {
    const { payload } = createPayload()

    const scan = await getAltTextHealthScan(createRequest(payload), createCacheFactory())

    assert.equal(countsFor(scan, 'images').totalDocs, 3)
  })

  test('applies a per-collection filter, so collections without the field stay whole', async () => {
    const { payload } = createPayload()
    const req = createRequest(payload, ({ collection }): Where =>
      collection === 'shared-media' ? {} : { tenant: { equals: 'acme' } },
    )

    const scan = await getAltTextHealthScan(req, createCacheFactory())

    assert.equal(countsFor(scan, 'images').totalDocs, 2)
    assert.equal(countsFor(scan, 'shared-media').totalDocs, 2)
  })

  test('does not serve one filter’s cached scan to another', async () => {
    const cacheFactory = createCacheFactory()
    const { payload } = createPayload()

    const acme = await getAltTextHealthScan(
      createRequest(payload, () => ({ tenant: { equals: 'acme' } })),
      cacheFactory,
    )
    const globex = await getAltTextHealthScan(
      createRequest(payload, () => ({ tenant: { equals: 'globex' } })),
      cacheFactory,
    )

    assert.equal(countsFor(acme, 'images').totalDocs, 2)
    assert.equal(countsFor(globex, 'images').totalDocs, 1)
    assert.deepEqual(countsFor(globex, 'images').invalidDocIds, ['g1'])
  })

  test('reuses the cached scan when the filter resolves to the same constraint', async () => {
    const cacheFactory = createCacheFactory()
    const { payload, queries } = createPayload()
    const baseFilter = () => ({ tenant: { equals: 'acme' } })

    await getAltTextHealthScan(createRequest(payload, baseFilter), cacheFactory)
    await getAltTextHealthScan(createRequest(payload, baseFilter), cacheFactory)

    assert.equal(queries.filter((query) => query.collection === 'images').length, 1)
  })

  test('reports a throwing filter as a scan error instead of failing the request', async () => {
    const { payload } = createPayload()
    const req = createRequest(payload, () => {
      throw new Error('tenant cookie points at a deleted tenant')
    })

    const scan = await getAltTextHealthScan(req, createCacheFactory())

    assert.equal(scan.collections.length, 0)
    assert.equal(scan.errors.length, 1)
    assert.equal(scan.errors[0].code, 'ALT_TEXT_BASE_FILTER_FAILED')
    assert.match(scan.errors[0].message, /deleted tenant/)
    // Errors carrying a `collection` are dropped for users who cannot read it; this one
    // names the collection in its message so it survives to the widget.
    assert.equal(scan.errors[0].collection, undefined)
    assert.match(scan.errors[0].message, /images/)
  })
})
