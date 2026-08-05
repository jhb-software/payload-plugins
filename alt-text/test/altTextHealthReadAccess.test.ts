import assert from 'node:assert/strict'

import type { PayloadRequest, Where } from 'payload'

import { describe, test } from 'vitest'

import type { AltTextHealthScan } from '../src/utilities/altTextHealth.ts'

import { filterScanByReadAccess, toWidgetData } from '../src/utilities/altTextHealth.ts'

/**
 * The health scan is computed once with elevated access and shared via the
 * cache, so the response must be filtered per request to the collections the
 * caller may read. Otherwise any authenticated user could enumerate counts and
 * document IDs for upload collections their role cannot read
 * (companion to the GHSA-4qpv-39hg-f7fx endpoint fix).
 */

type ReadAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean | Where> | Where

function reqWithReadAccess(accessBySlug: Record<string, ReadAccess>): PayloadRequest {
  return {
    payload: {
      collections: Object.fromEntries(
        Object.entries(accessBySlug).map(([slug, read]) => [
          slug,
          { config: { access: { read } } },
        ]),
      ),
    },
    user: { id: 'user-1' },
  } as unknown as PayloadRequest
}

function buildScan(): AltTextHealthScan {
  return {
    checkedAt: '2026-01-01T00:00:00.000Z',
    collections: [
      {
        collection: 'media',
        completeDocs: 2,
        invalidDocIds: ['m1'],
        missingDocs: 1,
        partialDocs: 0,
        totalDocs: 3,
      },
      {
        collection: 'secret',
        completeDocs: 0,
        invalidDocIds: ['s1', 's2'],
        missingDocs: 2,
        partialDocs: 0,
        totalDocs: 2,
      },
    ],
    errors: [
      {
        code: 'ALT_TEXT_COLLECTION_READ_FAILED',
        collection: 'secret',
        message: 'boom',
        operation: 'find',
      },
    ],
    isLocalized: false,
    localeCodes: [],
  }
}

describe('filterScanByReadAccess', () => {
  test('drops collections the user has no read access to', async () => {
    const req = reqWithReadAccess({ media: () => true, secret: () => false })

    const filtered = await filterScanByReadAccess(req, buildScan())

    assert.deepEqual(
      filtered.collections.map((c) => c.collection),
      ['media'],
    )
  })

  test('drops errors that reference a collection the user cannot read', async () => {
    const req = reqWithReadAccess({ media: () => true, secret: () => false })

    const filtered = await filterScanByReadAccess(req, buildScan())

    assert.equal(filtered.errors.length, 0)
  })

  test('keeps collections whose read access is a scoped Where constraint', async () => {
    const req = reqWithReadAccess({
      media: () => true,
      secret: () => ({ owner: { equals: 'user-1' } }),
    })

    const filtered = await filterScanByReadAccess(req, buildScan())

    assert.deepEqual(
      filtered.collections.map((c) => c.collection),
      ['media', 'secret'],
    )
  })

  test('treats a thrown access function as denied', async () => {
    const req = reqWithReadAccess({
      media: () => true,
      secret: () => {
        throw new Error('Forbidden')
      },
    })

    const filtered = await filterScanByReadAccess(req, buildScan())

    assert.deepEqual(
      filtered.collections.map((c) => c.collection),
      ['media'],
    )
  })

  test('widget totals count only the collections the user may read', async () => {
    const req = reqWithReadAccess({ media: () => true, secret: () => false })

    const widgetData = toWidgetData(await filterScanByReadAccess(req, buildScan()))

    assert.equal(widgetData.totalDocs, 3)
    assert.deepEqual(
      widgetData.collections.map((c) => c.collection),
      ['media'],
    )
  })
})
