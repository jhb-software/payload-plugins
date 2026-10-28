import type { Payload, PayloadRequest } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import assert from 'node:assert/strict'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { payloadAltTextPlugin } from '../src/plugin.ts'

/**
 * `onlyMissing` fills the gaps without touching alt texts an editor already
 * wrote, and without paying for locales that are already done. Without `ids`,
 * the endpoint picks the images with gaps itself.
 */

vi.mock('next/cache.js', () => ({
  revalidateTag: (): void => {},
  unstable_cache: (compute: () => unknown) => compute,
}))

vi.mock('next/server.js', () => ({
  after: (): void => {},
}))

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')

describe('bulk generation with onlyMissing', () => {
  let payload: Payload
  let user: NonNullable<PayloadRequest['user']>
  const bulkCalls: { filename?: string; locales: string[] }[] = []

  async function bulkGenerate(body: Record<string, unknown>) {
    const req = await createLocalReq({ user }, payload)
    req.json = async () => ({ collection: 'media', ...body })
    const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)
    return { body: await response.json(), status: response.status }
  }

  async function createImage(
    name: string,
    alt: Partial<Record<'de' | 'en', string>> = {},
    options: { file?: Buffer; mimetype?: string; tenant?: string } = {},
  ): Promise<number | string> {
    const file = options.file ?? png
    const doc = await payload.create({
      collection: 'media',
      data: { alt: alt.en, tenant: options.tenant ?? 'acme' },
      file: {
        name: `${name}.${options.mimetype === 'image/svg+xml' ? 'svg' : 'png'}`,
        data: file,
        mimetype: options.mimetype ?? 'image/png',
        size: file.length,
      },
      locale: 'en',
    })

    if (alt.de) {
      await payload.update({
        id: doc.id,
        collection: 'media',
        data: { alt: alt.de },
        locale: 'de',
      })
    }

    return doc.id
  }

  async function altTextsOf(id: number | string): Promise<Record<string, string | undefined>> {
    const doc = await payload.findByID({ id, collection: 'media', locale: 'all' })
    return (doc as unknown as { alt?: Record<string, string> }).alt ?? {}
  }

  beforeAll(async () => {
    const config = await buildConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        {
          slug: 'media',
          fields: [{ name: 'tenant', type: 'text' }],
          upload: { disableLocalStorage: true },
        },
      ],
      db: sqliteAdapter({ client: { url: 'file::memory:' } }),
      localization: { defaultLocale: 'en', fallback: false, locales: ['en', 'de'] },
      plugins: [
        payloadAltTextPlugin({
          collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
          getImageThumbnail: () => 'https://example.com/thumb.png',
          healthCheck: {
            baseFilter: () => ({ tenant: { equals: 'acme' } }),
          },
          resolver: {
            key: 'mock',
            resolve: async () => ({ success: false, error: 'unused' }),
            resolveBulk: async ({ filename, locales }) => {
              bulkCalls.push({ filename, locales: [...locales] })
              return {
                success: true,
                results: Object.fromEntries(
                  locales.map((locale) => [
                    locale,
                    { altText: `generated ${locale}`, keywords: [locale] },
                  ]),
                ),
              }
            },
            supportedMimeTypes: ['image/png'],
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
  })

  beforeEach(async () => {
    bulkCalls.length = 0
    await payload.delete({ collection: 'media', where: { id: { exists: true } } })
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  describe('with ids', () => {
    test('generates only the empty locales and keeps the alt text an editor wrote', async () => {
      const id = await createImage('half-done', { en: 'Written by an editor' })

      const { body, status } = await bulkGenerate({ ids: [id], onlyMissing: true })

      assert.equal(status, 200)
      assert.equal(body.updatedDocs, 1)
      assert.deepEqual(bulkCalls, [{ filename: 'half-done.png', locales: ['de'] }])
      assert.deepEqual(await altTextsOf(id), { de: 'generated de', en: 'Written by an editor' })
    })

    test('skips a complete image without calling the resolver', async () => {
      const id = await createImage('done', { de: 'Fertig', en: 'Done' })

      const { body } = await bulkGenerate({ ids: [id], onlyMissing: true })

      assert.equal(body.updatedDocs, 0)
      assert.deepEqual(body.skippedDocs, [{ id, reason: 'complete' }])
      assert.deepEqual(bulkCalls, [])
      assert.deepEqual(await altTextsOf(id), { de: 'Fertig', en: 'Done' })
    })

    test('generates only the requested locales', async () => {
      const id = await createImage('photo', { de: 'Alt', en: 'Old' })

      await bulkGenerate({ ids: [id], locales: ['de'] })

      assert.deepEqual(bulkCalls, [{ filename: 'photo.png', locales: ['de'] }])
      assert.deepEqual(await altTextsOf(id), { de: 'generated de', en: 'Old' })
    })

    test('rejects a requested locale the project does not configure', async () => {
      const id = await createImage('photo')

      const { status } = await bulkGenerate({ ids: [id], locales: ['fr'] })

      assert.equal(status, 400)
      assert.deepEqual(bulkCalls, [])
    })

    test('still regenerates every locale when onlyMissing is not set', async () => {
      const id = await createImage('half-done', { en: 'Written by an editor' })

      await bulkGenerate({ ids: [id] })

      assert.deepEqual(await altTextsOf(id), { de: 'generated de', en: 'generated en' })
    })
  })

  describe('without ids', () => {
    test('picks only the images with gaps and fills them', async () => {
      const empty = await createImage('empty')
      const partial = await createImage('partial', { de: 'Nur Deutsch' })
      const complete = await createImage('complete', { de: 'Fertig', en: 'Done' })

      const { body, status } = await bulkGenerate({ onlyMissing: true })

      assert.equal(status, 200)
      assert.equal(body.totalDocs, 2)
      assert.equal(body.updatedDocs, 2)
      assert.deepEqual(await altTextsOf(empty), { de: 'generated de', en: 'generated en' })
      assert.deepEqual(await altTextsOf(partial), { de: 'Nur Deutsch', en: 'generated en' })
      assert.deepEqual(await altTextsOf(complete), { de: 'Fertig', en: 'Done' })
    })

    test('picks at most `limit` images, so repeated calls work through the library', async () => {
      for (const name of ['a', 'b', 'c']) {
        await createImage(name)
      }

      const first = await bulkGenerate({ limit: 2, onlyMissing: true })
      const second = await bulkGenerate({ limit: 2, onlyMissing: true })
      const third = await bulkGenerate({ limit: 2, onlyMissing: true })

      assert.equal(first.body.updatedDocs, 2)
      assert.equal(second.body.updatedDocs, 1)
      assert.equal(third.body.totalDocs, 0)
    })

    test('picks only images inside the health check base filter', async () => {
      const acme = await createImage('acme-photo')
      const globex = await createImage('globex-photo', {}, { tenant: 'globex' })

      await bulkGenerate({ onlyMissing: true })

      assert.deepEqual(await altTextsOf(acme), { de: 'generated de', en: 'generated en' })
      const untouched = await altTextsOf(globex)
      assert.equal(untouched.en, undefined)
      assert.equal(untouched.de, undefined)
    })

    test('does not pick images the resolver cannot read, so they never block the next batch', async () => {
      await createImage('logo', {}, { file: svg, mimetype: 'image/svg+xml' })
      const photo = await createImage('photo')

      const { body } = await bulkGenerate({ limit: 1, onlyMissing: true })

      assert.equal(body.updatedDocs, 1)
      assert.deepEqual(await altTextsOf(photo), { de: 'generated de', en: 'generated en' })
    })

    test('passes over excluded images, so ones that keep failing do not block the next batch', async () => {
      const failing = await createImage('failing')
      const next = await createImage('next')

      const { body } = await bulkGenerate({ excludeIds: [failing], limit: 1, onlyMissing: true })

      assert.equal(body.updatedDocs, 1)
      assert.deepEqual(await altTextsOf(next), { de: 'generated de', en: 'generated en' })
      assert.equal((await altTextsOf(failing)).en, undefined)
    })

    test('picks only images with a gap in the requested locales', async () => {
      await createImage('german-done', { de: 'Fertig' })
      const germanMissing = await createImage('german-missing', { en: 'Done' })

      const { body } = await bulkGenerate({ locales: ['de'], onlyMissing: true })

      assert.equal(body.totalDocs, 1)
      assert.deepEqual(await altTextsOf(germanMissing), { de: 'generated de', en: 'Done' })
    })

    test('rejects a request with neither ids nor onlyMissing', async () => {
      const { status } = await bulkGenerate({})

      assert.equal(status, 400)
    })

    test('rejects a limit above maxBulkGenerateIds', async () => {
      const { status } = await bulkGenerate({ limit: 101, onlyMissing: true })

      assert.equal(status, 400)
    })
  })
})
