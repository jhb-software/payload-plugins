import type { Payload, PayloadRequest, Where } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import assert from 'node:assert/strict'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, describe, test } from 'vitest'

import type { AltTextHealthScan } from '../src/utilities/altTextHealth.ts'
import type { AltTextHealthCacheFactory } from '../src/utilities/altTextHealthCache.ts'

import { payloadAltTextPlugin } from '../src/plugin.ts'
import { getAltTextHealthScan, toWidgetData } from '../src/utilities/altTextHealth.ts'

/**
 * The health report must honour each collection's `read` access for the requesting
 * user at row level, not just at collection level. A tenant-scoped `read` rule
 * returns a `Where`; treating that as full visibility discloses the other tenants'
 * counts and document IDs to any account passing the endpoint gate.
 */

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

type User = { collection: 'users'; id: number | string; role: string; tenant?: string }

/**
 * Behavioural stand-in for `unstable_cache`: memoizes on the joined key parts and
 * counts the scans it had to compute, so cache sharing is observable.
 */
function createCacheFactory() {
  const entries = new Map<string, Promise<AltTextHealthScan>>()
  let computations = 0

  const cacheFactory: AltTextHealthCacheFactory<AltTextHealthScan> = (compute, cacheKeyParts) => {
    return () => {
      const key = cacheKeyParts.join('|')
      const cached = entries.get(key)

      if (cached) {
        return cached
      }

      computations++
      const pending = compute()
      entries.set(key, pending)

      return pending
    }
  }

  return { cacheFactory, computations: () => computations }
}

describe('health report row-level read access', () => {
  let payload: Payload
  const users: Record<string, User> = {}
  const ids: Record<string, number | string> = {}

  async function reqFor(user: User): Promise<PayloadRequest> {
    return createLocalReq({ user: user as unknown as NonNullable<PayloadRequest['user']> }, payload)
  }

  async function seedImage(collection: string, name: string, data: Record<string, unknown>) {
    const doc = await payload.create({
      collection,
      data,
      file: { name: `${name}.png`, data: png, mimetype: 'image/png', size: png.length },
    })
    ids[name] = doc.id
  }

  async function seedUser(name: string, data: { role: string; tenant?: string }) {
    const doc = await payload.create({
      collection: 'users',
      data: { ...data, email: `${name}@example.com`, password: 'password' },
    })
    users[name] = { collection: 'users', id: doc.id, ...data }
  }

  beforeAll(async () => {
    const tenantScoped = ({ req }: { req: PayloadRequest }): boolean | Where => {
      const user = req.user as null | User

      if (!user) {
        return false
      }

      return user.role === 'admin' ? true : { tenant: { equals: user.tenant } }
    }

    const config = await buildConfig({
      collections: [
        {
          slug: 'users',
          auth: true,
          fields: [
            { name: 'role', type: 'text' },
            { name: 'tenant', type: 'text' },
          ],
        },
        {
          slug: 'media',
          access: { read: tenantScoped },
          fields: [{ name: 'tenant', type: 'text' }],
          upload: { disableLocalStorage: true },
        },
        {
          slug: 'secret',
          access: { read: () => false },
          fields: [],
          upload: { disableLocalStorage: true },
        },
        {
          slug: 'restricted',
          access: {
            read: () => {
              throw new Error('Forbidden')
            },
          },
          fields: [],
          upload: { disableLocalStorage: true },
        },
      ],
      db: sqliteAdapter({ client: { url: 'file::memory:' } }),
      // Localized so an image can be stored without alt text (the column is
      // NOT NULL when unlocalized); one locale keeps complete/missing binary.
      localization: { defaultLocale: 'en', locales: ['en'] },
      plugins: [
        payloadAltTextPlugin({
          collections: [
            { slug: 'media', mimeTypes: ['image/*'] },
            { slug: 'secret', mimeTypes: ['image/*'] },
            { slug: 'restricted', mimeTypes: ['image/*'] },
          ],
          getImageThumbnail: () => 'https://example.com/thumb.png',
          resolver: {
            key: 'mock',
            resolve: async () => ({ success: false, error: 'not used' }),
            resolveBulk: async () => ({ success: false, error: 'not used' }),
          },
        }),
      ],
      secret: 'test-secret',
      telemetry: false,
    })
    payload = await getPayload({ config })

    await seedUser('acme-editor', { role: 'editor', tenant: 'acme' })
    await seedUser('acme-reviewer', { role: 'editor', tenant: 'acme' })
    await seedUser('globex-editor', { role: 'editor', tenant: 'globex' })
    await seedUser('admin', { role: 'admin' })

    await seedImage('media', 'acme-missing', { tenant: 'acme' })
    await seedImage('media', 'acme-complete', { alt: 'An Acme photo', tenant: 'acme' })
    await seedImage('media', 'globex-missing', { tenant: 'globex' })
    await seedImage('secret', 'secret-missing', {})
    await seedImage('restricted', 'restricted-missing', {})
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  const countsFor = (scan: AltTextHealthScan, collection: string) =>
    scan.collections.find((entry) => entry.collection === collection)

  test('reports only the rows the requesting user may read', async () => {
    const { cacheFactory } = createCacheFactory()

    const scan = await getAltTextHealthScan(await reqFor(users['acme-editor']), cacheFactory)

    const media = countsFor(scan, 'media')
    assert.ok(media)
    assert.equal(media.totalDocs, 2)
    assert.equal(media.missingDocs, 1)
    assert.deepEqual(media.invalidDocIds, [ids['acme-missing']])
  })

  test('reports every row to a user whose read access is unconstrained', async () => {
    const { cacheFactory } = createCacheFactory()

    const scan = await getAltTextHealthScan(await reqFor(users['admin']), cacheFactory)

    assert.equal(countsFor(scan, 'media')?.totalDocs, 3)
  })

  test('omits collections the requesting user cannot read at all', async () => {
    const { cacheFactory } = createCacheFactory()

    const scan = await getAltTextHealthScan(await reqFor(users['admin']), cacheFactory)

    assert.deepEqual(
      scan.collections.map((entry) => entry.collection),
      ['media'],
    )
  })

  test('treats a throwing read access as denied, without reporting an error', async () => {
    const { cacheFactory } = createCacheFactory()

    const scan = await getAltTextHealthScan(await reqFor(users['admin']), cacheFactory)

    assert.equal(countsFor(scan, 'restricted'), undefined)
    assert.deepEqual(scan.errors, [])
  })

  test('leaves the caller’s request untouched', async () => {
    const { cacheFactory } = createCacheFactory()
    // The dashboard request is shared by every widget: a scan that wrote its
    // `'all'` locale onto it would hand the other widgets every locale's values.
    const req = await createLocalReq(
      {
        locale: 'en',
        user: users['acme-editor'] as unknown as NonNullable<PayloadRequest['user']>,
      },
      payload,
    )
    req.transactionID = 'caller-transaction'

    await getAltTextHealthScan(req, cacheFactory)

    assert.equal(req.locale, 'en')
    assert.equal(req.transactionID, 'caller-transaction')
  })

  test('does not serve one tenant’s cached scan to another', async () => {
    const { cacheFactory } = createCacheFactory()

    await getAltTextHealthScan(await reqFor(users['acme-editor']), cacheFactory)
    const globex = await getAltTextHealthScan(await reqFor(users['globex-editor']), cacheFactory)

    const media = countsFor(globex, 'media')
    assert.equal(media?.totalDocs, 1)
    assert.deepEqual(media?.invalidDocIds, [ids['globex-missing']])
  })

  test('shares the cached scan between users with the same read constraint', async () => {
    const { cacheFactory, computations } = createCacheFactory()

    await getAltTextHealthScan(await reqFor(users['acme-editor']), cacheFactory)
    await getAltTextHealthScan(await reqFor(users['acme-reviewer']), cacheFactory)

    assert.equal(computations(), 1)
  })

  test('widget totals count only the rows the requesting user may read', async () => {
    const { cacheFactory } = createCacheFactory()

    const widgetData = toWidgetData(
      await getAltTextHealthScan(await reqFor(users['globex-editor']), cacheFactory),
    )

    assert.equal(widgetData.totalDocs, 1)
    assert.deepEqual(
      widgetData.collections.map((entry) => entry.collection),
      ['media'],
    )
  })
})
