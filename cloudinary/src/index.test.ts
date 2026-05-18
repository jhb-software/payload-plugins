import type { CollectionConfig, Config } from 'payload'

import { describe, expect, it } from 'vitest'

import type { CloudinaryStorageOptions } from './types.js'

import { payloadCloudinaryPlugin } from './index.js'

const baseOptions: CloudinaryStorageOptions = {
  clientUploads: true,
  cloudName: 'test-cloud',
  collections: {
    media: true,
  },
  credentials: {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
  },
  folder: 'test-folder',
}

const mediaCollection: CollectionConfig = {
  slug: 'media',
  fields: [],
  upload: {
    mimeTypes: ['image/*'],
  },
}

async function buildConfig(overrides: Partial<CloudinaryStorageOptions> = {}): Promise<Config> {
  const incoming = {
    collections: [mediaCollection],
  } as unknown as Config

  return await payloadCloudinaryPlugin({ ...baseOptions, ...overrides })(incoming)
}

function getMediaCollection(config: Config): CollectionConfig {
  const media = config.collections?.find((c) => c.slug === 'media')
  if (!media) {
    throw new Error('media collection missing')
  }
  return media
}

async function runBeforeChange(
  config: Config,
  args: {
    data: Record<string, unknown>
    req: { file?: { clientUploadContext?: unknown } }
  },
) {
  const media = getMediaCollection(config)
  const hooks = media.hooks?.beforeChange ?? []
  let data = args.data
  for (const hook of hooks) {
    const result = await (hook as (a: unknown) => unknown)({
      collection: media,
      context: {},
      data,
      operation: 'create',
      originalDoc: undefined,
      req: args.req,
    })
    if (result && typeof result === 'object') {
      data = result as Record<string, unknown>
    }
  }
  return data
}

describe('payloadCloudinaryPlugin client-upload persistence', () => {
  it('persists cloudinaryPublicId and url from req.file.clientUploadContext into the saved document', async () => {
    const config = await buildConfig()

    const data = await runBeforeChange(config, {
      data: { filename: 'photo.jpg', mimeType: 'image/jpeg' },
      req: {
        file: {
          clientUploadContext: {
            publicId: 'test-folder/photo',
            secureUrl:
              'https://res.cloudinary.com/test-cloud/image/upload/v1/test-folder/photo.jpg',
          },
        },
      },
    })

    expect(data.cloudinaryPublicId).toBe('test-folder/photo')
    expect(data.url).toBe(
      'https://res.cloudinary.com/test-cloud/image/upload/v1/test-folder/photo.jpg',
    )
  })

  it('leaves data unchanged when no client upload happened', async () => {
    const config = await buildConfig()

    const data = await runBeforeChange(config, {
      data: { filename: 'photo.jpg', mimeType: 'image/jpeg' },
      req: { file: {} },
    })

    expect(data.cloudinaryPublicId).toBeUndefined()
  })

  it('does not touch collections that are not configured for cloudinary', async () => {
    const other: CollectionConfig = { slug: 'pages', fields: [] }
    const incoming = {
      collections: [mediaCollection, other],
    } as unknown as Config

    const config = await payloadCloudinaryPlugin(baseOptions)(incoming)

    const pages = config.collections?.find((c) => c.slug === 'pages')
    expect(pages?.hooks?.beforeChange ?? []).toHaveLength(0)
  })
})
