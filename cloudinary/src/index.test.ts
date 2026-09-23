import type { CollectionConfig, Config } from 'payload'

import { v2 as cloudinary } from 'cloudinary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
        Record<string, unknown> | undefined) ?? data
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

describe('payloadCloudinaryPlugin client-upload receipts', () => {
  it('requires a server-issued receipt for client uploads to managed collections', () => {
    const config = buildConfig({
      ...baseOptions,
      clientUploads: true,
      collections: { media: true },
    })
    const upload = getCollection(config, 'media').upload

    expect(typeof upload === 'object' && upload.requiresClientUploadReceipt).toBe(true)
  })

  it('registers a confirm endpoint per plugin instance and hands its path to the client', () => {
    const first = payloadCloudinaryPlugin({
      ...baseOptions,
      clientUploads: true,
      collections: { media: true },
    })
    const second = payloadCloudinaryPlugin({
      ...baseOptions,
      clientUploads: true,
      collections: { docs: true },
    })
    const config = second(
      first({
        collections: [
          { slug: 'media', fields: [], upload: true },
          { slug: 'docs', fields: [], upload: true },
        ],
      } as unknown as Config) as Config,
    ) as Config

    const confirmPaths = (config.endpoints || [])
      .map((endpoint) => endpoint.path)
      .filter((path) => path.startsWith('/cloudinary-confirm-upload'))
    expect(confirmPaths).toEqual(['/cloudinary-confirm-upload', '/cloudinary-confirm-upload-1'])

    const providers = (config.admin?.components?.providers || []) as {
      clientProps?: { collectionSlug: string; extra?: { confirmHandlerPath?: string } }
    }[]
    const confirmPathFor = (slug: string) =>
      providers.find((p) => p.clientProps?.collectionSlug === slug)?.clientProps?.extra
        ?.confirmHandlerPath
    expect(confirmPathFor('media')).toBe('/cloudinary-confirm-upload')
    expect(confirmPathFor('docs')).toBe('/cloudinary-confirm-upload-1')
  })
})

describe('payloadCloudinaryPlugin server re-upload of processed client uploads', () => {
  const clientContext = {
    publicId: 'media/photo',
    secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/media/photo.jpg',
  }

  let uploadOptions: Record<string, unknown>[] = []

  beforeEach(() => {
    uploadOptions = []
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      options: Record<string, unknown>,
      callback: (error: unknown, result: unknown) => void,
    ) => {
      uploadOptions.push(options)
      const publicId = String(options.public_id)
      return {
        end: () =>
          callback(undefined, {
            public_id: publicId,
            secure_url: `https://res.cloudinary.com/demo/image/upload/v2/${publicId}.webp`,
          }),
      }
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Mirrors core's create sequence: beforeOperation hooks, then generateFileData (which drops the
   * client upload context when sharp re-encodes the file), then beforeChange and afterChange.
   */
  async function runCreate({
    clientUploadContext,
    processedBySharp,
    sizes,
  }: {
    clientUploadContext?: typeof clientContext
    processedBySharp: boolean
    sizes?: Record<string, Buffer>
  }) {
    const config = buildConfig({
      ...baseOptions,
      clientUploads: true,
      collections: { media: true },
      folder: 'media',
    })
    const collection = getCollection(config, 'media')

    const req = {
      context: {} as Record<string, unknown>,
      file: {
        name: 'photo.jpg',
        clientUploadContext,
        data: Buffer.from('bytes'),
        mimetype: 'image/webp',
        size: 5,
      } as Record<string, unknown>,
      payload: { logger: { error: vi.fn() }, update: vi.fn().mockResolvedValue({}) },
      payloadUploadSizes: sizes,
    }

    for (const hook of collection.hooks?.beforeOperation ?? []) {
      await hook({ args: { req }, context: req.context, operation: 'create', req } as never)
    }

    if (processedBySharp) {
      delete req.file.clientUploadContext
    }

    const data = await runBeforeChange(collection, req)
    const doc = {
      ...data,
      id: 1,
      filename: 'photo.webp',
      mimeType: 'image/webp',
      sizes: sizes
        ? Object.fromEntries(
            Object.keys(sizes).map((name) => [
              name,
              { filename: `photo-${name}.webp`, mimeType: 'image/webp' },
            ]),
          )
        : undefined,
    }

    let result: Record<string, unknown> = doc
    for (const hook of collection.hooks?.afterChange ?? []) {
      result =
        ((await hook({ doc: result, operation: 'create', previousDoc: {}, req } as never)) as
          Record<string, unknown> | undefined) ?? result
    }
    return result
  }

  it('replaces the browser upload under its public id when sharp re-encoded the file', async () => {
    const doc = await runCreate({ clientUploadContext: clientContext, processedBySharp: true })

    expect(uploadOptions).toHaveLength(1)
    expect(uploadOptions[0]).toMatchObject({
      invalidate: true,
      overwrite: true,
      public_id: 'media/photo',
    })
    expect(uploadOptions[0].folder).toBeUndefined()
    expect(doc.cloudinaryPublicId).toBe('media/photo')
    expect(doc.url).toBe('https://res.cloudinary.com/demo/image/upload/v2/media/photo.webp')
  })

  it('does not re-upload a client upload that core left untouched', async () => {
    const doc = await runCreate({ clientUploadContext: clientContext, processedBySharp: false })

    expect(uploadOptions).toHaveLength(0)
    expect(doc.cloudinaryPublicId).toBe('media/photo')
    expect(doc.url).toBe(clientContext.secureUrl)
  })

  it('uploads generated image sizes under their own public ids, not the browser upload', async () => {
    await runCreate({
      clientUploadContext: clientContext,
      processedBySharp: false,
      sizes: { thumbnail: Buffer.from('thumb') },
    })

    expect(uploadOptions).toHaveLength(1)
    expect(uploadOptions[0]).toMatchObject({ folder: 'media/', public_id: 'photo-thumbnail' })
    expect(uploadOptions[0].overwrite).toBeUndefined()
  })

  it('uploads a server-side file into the folder under a generated public id', async () => {
    await runCreate({ processedBySharp: false })

    expect(uploadOptions).toHaveLength(1)
    expect(uploadOptions[0]).toMatchObject({ folder: 'media/', public_id: 'photo' })
    expect(uploadOptions[0].overwrite).toBeUndefined()
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
