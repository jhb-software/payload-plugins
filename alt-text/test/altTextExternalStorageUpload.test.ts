import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import type { Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import assert from 'node:assert/strict'
import { buildConfig, getPayload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import { payloadAltTextPlugin } from '../src/plugin.ts'

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * Behavioral fake of `@payloadcms/storage-s3`: its `handleUpload` returns the
 * incoming document data, which makes the cloud-storage plugin persist that data
 * in a second, internal `update` of the freshly created document.
 */
const s3LikeAdapter: Adapter = () => ({
  name: 's3-like',
  generateURL: ({ filename }) => `https://storage.example.com/${filename}`,
  handleDelete: async () => {},
  handleUpload: async ({ data }) => data,
  staticHandler: () => new Response(null, { status: 404 }),
})

/**
 * Controls the clock read by `new Date()` / `Date.now()`. Each read advances it by
 * `step` milliseconds: `1` makes the database adapter's separate `createdAt` and
 * `updatedAt` timestamps of a single create land in different milliseconds (as
 * happens intermittently on real clocks), `0` makes them always equal.
 */
function useClock(step: number): () => void {
  const RealDate = Date
  let now = RealDate.now()
  class TickingDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(now)
        now += step
      } else {
        // @ts-expect-error - forwarding the original constructor arguments
        super(...args)
      }
    }

    static override now(): number {
      const current = now
      now += step
      return current
    }
  }
  globalThis.Date = TickingDate as DateConstructor
  return () => {
    globalThis.Date = RealDate
  }
}

describe('alt text validation with an external storage adapter', () => {
  let payload: Payload
  let restoreClock: (() => void) | undefined

  beforeAll(async () => {
    const config = await buildConfig({
      collections: [{ slug: 'media', fields: [], upload: true }],
      db: sqliteAdapter({ client: { url: 'file::memory:' } }),
      localization: { defaultLocale: 'en', locales: ['en', 'de'] },
      plugins: [
        payloadAltTextPlugin({
          collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
          healthCheck: false,
          resolver: {
            key: 'mock',
            resolve: async () => ({ success: false, error: 'not used' }),
            resolveBulk: async () => ({ success: false, error: 'not used' }),
          },
        }),
        cloudStoragePlugin({ collections: { media: { adapter: s3LikeAdapter } } }),
      ],
      secret: 'test-secret',
      telemetry: false,
    })
    payload = await getPayload({ config })
  })

  afterEach(() => {
    restoreClock?.()
    restoreClock = undefined
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  test('uploads an image without alt text even when createdAt and updatedAt differ', async () => {
    restoreClock = useClock(1)

    const doc = await payload.create({
      collection: 'media',
      data: {},
      file: { name: 'photo.png', data: png, mimetype: 'image/png', size: png.length },
    })

    assert.equal(doc.filename, 'photo.png')
  })

  test('requires alt text on the first update of an image uploaded without one', async () => {
    restoreClock = useClock(0)

    const doc = await payload.create({
      collection: 'media',
      data: {},
      file: { name: 'later.png', data: png, mimetype: 'image/png', size: png.length },
    })

    await assert.rejects(
      payload.update({ id: doc.id, collection: 'media', data: { alt: '' } }),
      /alt/i,
    )
  })
})
