import type { PayloadRequest } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, createLocalReq, getPayload } from 'payload'

import type { AltTextHealthCheckConfig } from '../../src/types/AltTextPluginConfig.ts'

import { payloadAltTextPlugin } from '../../src/plugin.ts'
import { getAltTextHealth } from '../../src/utilities/altTextHealth.ts'

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * One CMS instance with a single image without alt text. Payload pushes the
 * schema once per process, so each test file sets up one instance.
 */
export async function setupHealthCacheInstance(healthCheck: AltTextHealthCheckConfig) {
  const config = await buildConfig({
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'media', fields: [], upload: { disableLocalStorage: true } },
    ],
    db: sqliteAdapter({ client: { url: 'file::memory:' } }),
    plugins: [
      payloadAltTextPlugin({
        collections: ['media'],
        getImageThumbnail: () => 'https://example.com/thumb.png',
        healthCheck,
        locale: 'en',
        resolver: {
          key: 'mock',
          resolve: async () => ({ success: false, error: 'unused' }),
          resolveBulk: async () => ({ success: false, error: 'unused' }),
        },
      }),
    ],
    secret: 'test-secret',
    telemetry: false,
  })
  const payload = await getPayload({ config })

  const created = await payload.create({
    collection: 'users',
    data: { email: 'editor@example.com', password: 'password' },
  })
  const user = { ...created, collection: 'users' } as unknown as NonNullable<PayloadRequest['user']>

  const image = await payload.create({
    collection: 'media',
    data: { alt: '' },
    file: { name: 'photo.png', data: png, mimetype: 'image/png', size: png.length },
  })

  const missingDocs = async (): Promise<number> => {
    const req = await createLocalReq({ user }, payload)
    return (await getAltTextHealth(req)).collections[0].missingDocs
  }

  /** A write handled by another instance: this instance's cache is never revalidated. */
  const fillOnAnotherInstance = () =>
    payload.update({
      id: image.id,
      collection: 'media',
      context: { disableRevalidate: true },
      data: { alt: 'Written elsewhere' },
    })

  return { fillOnAnotherInstance, missingDocs, payload }
}
