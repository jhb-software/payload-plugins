import type { Payload, PayloadRequest } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import assert from 'node:assert/strict'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'

import { bulkGenerateAltTexts } from '../src/index.ts'
import { payloadAltTextPlugin } from '../src/plugin.ts'

/** Without localization, `alt` is a plain string rather than a per-locale map. */

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

describe('bulk generation with onlyMissing in an unlocalized project', () => {
  let payload: Payload
  let user: NonNullable<PayloadRequest['user']>

  async function createImage(name: string, alt: string): Promise<number | string> {
    const doc = await payload.create({
      collection: 'media',
      data: { alt },
      file: { name: `${name}.png`, data: png, mimetype: 'image/png', size: png.length },
    })
    return doc.id
  }

  beforeAll(async () => {
    const config = await buildConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'media', fields: [], upload: { disableLocalStorage: true } },
      ],
      db: sqliteAdapter({ client: { url: 'file::memory:' } }),
      plugins: [
        payloadAltTextPlugin({
          collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
          getImageThumbnail: () => 'https://example.com/thumb.png',
          locale: 'en',
          resolver: {
            key: 'mock',
            resolve: async () => ({ success: false, error: 'unused' }),
            resolveBulk: async ({ locales }) => ({
              success: true,
              results: Object.fromEntries(
                locales.map((locale) => [locale, { altText: 'generated', keywords: [] }]),
              ),
            }),
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

  afterAll(async () => {
    await payload?.destroy()
  })

  test('picks and fills the image without alt text and leaves the written one alone', async () => {
    const empty = await createImage('empty', '')
    const written = await createImage('written', 'Written by an editor')

    const result = await bulkGenerateAltTexts({
      collection: 'media',
      onlyMissing: true,
      req: await createLocalReq({ user }, payload),
    })

    assert.equal(result.totalDocs, 1)
    assert.equal((await payload.findByID({ id: empty, collection: 'media' })).alt, 'generated')
    assert.equal(
      (await payload.findByID({ id: written, collection: 'media' })).alt,
      'Written by an editor',
    )
  })

  test('skips an image that already has alt text when given its id', async () => {
    const id = await createImage('done', 'Done')

    const result = await bulkGenerateAltTexts({
      collection: 'media',
      ids: [id],
      onlyMissing: true,
      req: await createLocalReq({ user }, payload),
    })

    assert.deepEqual(result.skippedDocs, [{ id, reason: 'complete' }])
  })
})
