import type { Payload, PayloadRequest, RequestContext } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import assert from 'node:assert/strict'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import type { FilterLocales } from '../src/types/AltTextPluginConfig.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { generateAltTextEndpoint } from '../src/endpoints/generateAltText.ts'
import { payloadAltTextPlugin } from '../src/plugin.ts'
import { getAltTextHealthCollectionTag } from '../src/utilities/altTextHealth.ts'

/**
 * In a multi-tenant project the locales a document may be written in depend on
 * the document's tenant, not on the request: one bulk run can span images of
 * several tenants. A bulk run also revalidates the health cache once, not per write.
 */

/**
 * Behavioral fake of a Next.js route handler scope: `after` defers its callback
 * past the response, and `revalidateTag` succeeds once running there.
 */
const nextRuntime = vi.hoisted(() => {
  const state = { afterQueue: [] as Array<() => void>, revalidatedTags: [] as string[] }

  return {
    /** Simulates the response finishing: Next runs the deferred callbacks. */
    flushAfterCallbacks: (): void => {
      for (const callback of state.afterQueue.splice(0)) {
        callback()
      }
    },
    reset: (): void => {
      state.afterQueue = []
      state.revalidatedTags = []
    },
    state,
  }
})

vi.mock('next/cache.js', () => ({
  revalidateTag: (tag: string): void => {
    nextRuntime.state.revalidatedTags.push(tag)
  },
  unstable_cache: (compute: () => unknown) => compute,
}))

vi.mock('next/server.js', () => ({
  after: (callback: () => void): void => {
    nextRuntime.state.afterQueue.push(callback)
  },
}))

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** The locales each tenant serves; the project configures their union. */
const tenantLocales: Record<string, string[]> = {
  acme: ['en', 'de'],
  globex: ['de'],
  // Its German write is rejected by a consumer hook, after English was written.
  'half-written': ['en', 'de'],
}

const filterLocales: FilterLocales = ({ doc, locales }) => {
  const tenant = doc?.tenant as string | undefined

  if (tenant === 'broken') {
    throw new Error('Tenant lookup failed')
  }

  return tenant ? tenantLocales[tenant] : locales
}

type Write = { context: RequestContext; id: number | string; locale?: string }

describe('per-document locales', () => {
  let payload: Payload
  let user: NonNullable<PayloadRequest['user']>
  const ids: Record<string, number | string> = {}
  const bulkCalls: { filename?: string; locales: string[] }[] = []
  const resolveCalls: string[] = []
  const writes: Write[] = []

  async function requestWith(body: unknown): Promise<PayloadRequest> {
    const req = await createLocalReq({ user }, payload)
    req.json = async () => body
    return req
  }

  async function bulkGenerate(names: string[]) {
    const req = await requestWith({ collection: 'media', ids: names.map((name) => ids[name]) })
    const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)
    return { body: await response.json(), status: response.status }
  }

  async function generate(name: string, locale: string, update = false) {
    const req = await requestWith({ id: ids[name], collection: 'media', locale, update })
    return generateAltTextEndpoint(({ req }) => !!req.user)(req)
  }

  async function altTextsOf(name: string): Promise<Record<string, string | undefined>> {
    const doc = await payload.findByID({ id: ids[name], collection: 'media', locale: 'all' })
    return (doc as unknown as { alt?: Record<string, string> }).alt ?? {}
  }

  beforeAll(async () => {
    const config = await buildConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        {
          slug: 'media',
          fields: [{ name: 'tenant', type: 'text' }],
          hooks: {
            beforeChange: [
              ({ data, originalDoc, req }) => {
                if (originalDoc?.tenant === 'half-written' && req.locale === 'de') {
                  throw new Error('German write rejected')
                }
                return data
              },
            ],
            // A consumer hook, recording what it can see of each write.
            afterChange: [
              ({ doc, req }) => {
                writes.push({
                  id: doc.id,
                  context: { ...req.context },
                  locale: req.locale ?? undefined,
                })
                return doc
              },
            ],
          },
          upload: { disableLocalStorage: true },
        },
      ],
      db: sqliteAdapter({ client: { url: 'file::memory:' } }),
      localization: { defaultLocale: 'en', fallback: false, locales: ['en', 'de', 'fr'] },
      plugins: [
        payloadAltTextPlugin({
          collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
          filterLocales,
          getImageThumbnail: () => 'https://example.com/thumb.png',
          resolver: {
            key: 'mock',
            resolve: async ({ locale }) => {
              resolveCalls.push(locale)
              return { success: true, result: { altText: `alt ${locale}`, keywords: [locale] } }
            },
            resolveBulk: async ({ filename, locales }) => {
              bulkCalls.push({ filename, locales: [...locales] })
              return {
                success: true,
                results: Object.fromEntries(
                  locales.map((locale) => [
                    locale,
                    { altText: `alt ${locale}`, keywords: [locale] },
                  ]),
                ),
              }
            },
          },
        }),
      ],
      secret: 'test-secret',
      telemetry: false,
    })
    payload = await getPayload({ config })

    const created = await payload.create({
      collection: 'users',
      data: { email: 'editor@example.com', password: 'password' },
    })
    user = { ...created, collection: 'users' } as unknown as NonNullable<PayloadRequest['user']>

    for (const [name, tenant] of [
      ['acme-photo', 'acme'],
      ['globex-photo', 'globex'],
      ['broken-photo', 'broken'],
      ['half-written-photo', 'half-written'],
    ]) {
      const doc = await payload.create({
        collection: 'media',
        context: { disableRevalidate: true },
        data: { tenant },
        file: { name: `${name}.png`, data: png, mimetype: 'image/png', size: png.length },
      })
      ids[name] = doc.id
    }
  })

  beforeEach(() => {
    bulkCalls.length = 0
    resolveCalls.length = 0
    writes.length = 0
    nextRuntime.reset()
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  test('bulk generation asks the resolver only for the locales each document’s tenant serves, and writes only those', async () => {
    const { body, status } = await bulkGenerate(['acme-photo', 'globex-photo'])

    assert.equal(status, 200)
    assert.equal(body.updatedDocs, 2)
    assert.deepEqual(Object.fromEntries(bulkCalls.map((call) => [call.filename, call.locales])), {
      'acme-photo.png': ['en', 'de'],
      'globex-photo.png': ['de'],
    })

    const acme = await altTextsOf('acme-photo')
    assert.equal(acme.en, 'alt en')
    assert.equal(acme.de, 'alt de')
    assert.equal(acme.fr, undefined)

    const globex = await altTextsOf('globex-photo')
    assert.equal(globex.de, 'alt de')
    assert.equal(globex.en, undefined)
    assert.equal(globex.fr, undefined)
  })

  test('a document whose locale filter throws is reported as errored while the others are still updated', async () => {
    const { body, status } = await bulkGenerate(['broken-photo', 'globex-photo'])

    assert.equal(status, 200)
    assert.deepEqual(body.erroredDocs, [ids['broken-photo']])
    assert.equal(body.updatedDocs, 1)
    assert.deepEqual(
      bulkCalls.map((call) => call.filename),
      ['globex-photo.png'],
    )
  })

  test('the generate endpoint rejects a locale the document’s tenant does not serve with 400', async () => {
    const response = await generate('globex-photo', 'en', true)

    assert.equal(response.status, 400)
    assert.deepEqual(resolveCalls, [])
    assert.deepEqual(writes, [])
  })

  test('the generate endpoint accepts a locale the document’s tenant serves', async () => {
    const response = await generate('acme-photo', 'en')

    assert.equal(response.status, 200)
    assert.deepEqual(resolveCalls, ['en'])
  })

  test('bulk writes skip the per-write health revalidation', async () => {
    await bulkGenerate(['acme-photo', 'globex-photo'])

    assert.equal(writes.length, 3)
    for (const write of writes) {
      assert.equal(write.context.disableRevalidate, true)
    }
  })

  test('a bulk run revalidates the collection’s health cache once, after the response', async () => {
    await bulkGenerate(['acme-photo', 'globex-photo'])

    nextRuntime.flushAfterCallbacks()

    assert.deepEqual(nextRuntime.state.revalidatedTags, [getAltTextHealthCollectionTag('media')])
  })

  test('a bulk run revalidates the health cache when a document failed after one of its locales was written', async () => {
    const { body } = await bulkGenerate(['half-written-photo'])

    nextRuntime.flushAfterCallbacks()

    assert.deepEqual(body.erroredDocs, [ids['half-written-photo']])
    assert.equal((await altTextsOf('half-written-photo')).en, 'alt en')
    assert.deepEqual(nextRuntime.state.revalidatedTags, [getAltTextHealthCollectionTag('media')])
  })

  test('a bulk run that updates no document leaves the health cache alone', async () => {
    await bulkGenerate(['broken-photo'])

    nextRuntime.flushAfterCallbacks()

    assert.deepEqual(nextRuntime.state.revalidatedTags, [])
  })
})
