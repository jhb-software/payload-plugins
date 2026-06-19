import type { CollectionConfig, Config } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CloudinaryStorageOptions } from './types.js'

import { payloadCloudinaryPlugin } from './index.js'

const baseOptions = {
  cloudName: 'demo',
  credentials: { apiKey: 'key', apiSecret: 'secret' },
} satisfies Partial<CloudinaryStorageOptions>

function buildConfig(options: CloudinaryStorageOptions): Config {
  const incomingConfig = {
    collections: [{ slug: 'media', fields: [], upload: true }],
  } as unknown as Config

  return payloadCloudinaryPlugin(options)(incomingConfig) as Config
}

function getCollection(config: Config, slug: string): CollectionConfig {
  const collection = (config.collections || []).find((c) => c.slug === slug)
  if (!collection) {
    throw new Error(`collection ${slug} not found`)
  }
  return collection
}

async function runBeforeChange(
  collection: CollectionConfig,
  req: unknown,
): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {}
  for (const hook of collection.hooks?.beforeChange ?? []) {
    data =
      ((await hook({ data, operation: 'create', req } as never)) as
        | Record<string, unknown>
        | undefined) ?? data
  }
  return data
}

describe('payloadCloudinaryPlugin client-upload persistence', () => {
  it('persists cloudinaryPublicId and url from the client upload context before the DB write', async () => {
    const config = buildConfig({
      ...baseOptions,
      clientUploads: true,
      collections: { media: true },
    })
    const collection = getCollection(config, 'media')

    const data = await runBeforeChange(collection, {
      context: {},
      file: {
        clientUploadContext: {
          publicId: 'media/photo',
          secureUrl: 'https://res.cloudinary.com/demo/media/photo',
        },
      },
    })

    expect(data.cloudinaryPublicId).toBe('media/photo')
    expect(data.url).toBe('https://res.cloudinary.com/demo/media/photo')
  })

  it('leaves the document untouched when the upload did not come from the client', async () => {
    const config = buildConfig({
      ...baseOptions,
      clientUploads: true,
      collections: { media: true },
    })
    const collection = getCollection(config, 'media')

    const data = await runBeforeChange(collection, { context: {} })

    expect(data.cloudinaryPublicId).toBeUndefined()
    expect(data.url).toBeUndefined()
  })

  it('does not register the persistence hook when client uploads are disabled', async () => {
    const config = buildConfig({ ...baseOptions, collections: { media: true } })
    const collection = getCollection(config, 'media')

    const data = await runBeforeChange(collection, {
      context: {},
      file: {
        clientUploadContext: {
          publicId: 'media/photo',
          secureUrl: 'https://res.cloudinary.com/demo/media/photo',
        },
      },
    })

    expect(data.cloudinaryPublicId).toBeUndefined()
    expect(data.url).toBeUndefined()
  })
})

describe('payloadCloudinaryPlugin static file serving', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serves a file resolved by filename when disablePayloadAccessControl is enabled', async () => {
    const config = buildConfig({
      ...baseOptions,
      clientUploads: true,
      collections: { media: { disablePayloadAccessControl: true } },
    })
    const collection = getCollection(config, 'media')
    const handlers = (typeof collection.upload === 'object' && collection.upload.handlers) || []

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers({ 'Content-Type': 'image/jpeg' }),
      }),
    )

    const req = {
      headers: new Headers(),
      payload: {
        find: vi.fn().mockResolvedValue({
          docs: [
            {
              cloudinaryPublicId: 'media/photo',
              url: 'https://res.cloudinary.com/demo/media/photo',
            },
          ],
        }),
      },
    }
    // A plain admin GET of the file carries no clientUploadContext.
    const params = { collection: 'media', filename: 'photo.jpg' }

    let served: Response | undefined
    for (const handler of handlers) {
      const res = (await handler(req as never, { params } as never)) as Response | undefined
      if (res) {
        served = res
        break
      }
    }

    expect(served?.status).toBe(200)
    expect(served?.headers.get('Content-Type')).toBe('image/jpeg')
  })
})
