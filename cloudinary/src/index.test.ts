import type { CollectionConfig, Config, FieldHook, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import type { CloudinaryStorageOptions } from './types.js'

import { payloadCloudinaryPlugin } from './index.js'

const baseOptions: CloudinaryStorageOptions = {
  clientUploads: true,
  cloudName: 'test-cloud',
  collections: {
    media: true,
    videos: { prefix: 'videos/' },
  },
  credentials: {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
  },
  folder: 'cloudinary-storage-plugin-test',
}

const mediaCollection: CollectionConfig = {
  slug: 'media',
  fields: [],
  upload: { mimeTypes: ['image/*'] },
}

const videosCollection: CollectionConfig = {
  slug: 'videos',
  fields: [],
  upload: { mimeTypes: ['video/*'] },
}

async function buildConfig(): Promise<Config> {
  const incoming = {
    collections: [mediaCollection, videosCollection],
  } as unknown as Config

  return await payloadCloudinaryPlugin(baseOptions)(incoming)
}

function findField(collection: CollectionConfig, name: string): TextField | undefined {
  return collection.fields.find(
    (f): f is TextField => 'name' in f && f.name === name && f.type === 'text',
  )
}

async function runFieldBeforeChange(
  hook: FieldHook,
  args: { data: Record<string, unknown>; originalDoc?: Record<string, unknown>; value?: unknown },
): Promise<unknown> {
  return await (hook as unknown as (a: unknown) => unknown)({
    collection: undefined,
    context: {},
    data: args.data,
    field: undefined,
    operation: 'create',
    originalDoc: args.originalDoc,
    req: {} as unknown,
    siblingData: args.data,
    value: args.value,
  })
}

describe('payloadCloudinaryPlugin — stateless publicId derivation', () => {
  it('derives cloudinaryPublicId from filename + folder for a collection with no prefix', async () => {
    const config = await buildConfig()
    const media = config.collections!.find((c) => c.slug === 'media')!
    const field = findField(media, 'cloudinaryPublicId')

    expect(field).toBeDefined()
    expect(field?.hooks?.beforeChange?.length ?? 0).toBeGreaterThan(0)

    const result = await runFieldBeforeChange(field!.hooks!.beforeChange![0], {
      data: { filename: 'photo.jpg', mimeType: 'image/jpeg' },
    })

    expect(result).toBe('cloudinary-storage-plugin-test/photo')
  })

  it('derives cloudinaryPublicId from filename + folder + collection prefix', async () => {
    const config = await buildConfig()
    const videos = config.collections!.find((c) => c.slug === 'videos')!
    const field = findField(videos, 'cloudinaryPublicId')

    const result = await runFieldBeforeChange(field!.hooks!.beforeChange![0], {
      data: { filename: 'clip.mp4', mimeType: 'video/mp4' },
    })

    expect(result).toBe('cloudinary-storage-plugin-test/videos/clip')
  })

  it('does not need req.file.clientUploadContext to populate cloudinaryPublicId', async () => {
    const config = await buildConfig()
    const media = config.collections!.find((c) => c.slug === 'media')!
    const field = findField(media, 'cloudinaryPublicId')

    const result = await runFieldBeforeChange(field!.hooks!.beforeChange![0], {
      data: { filename: 'photo.jpg', mimeType: 'image/jpeg' },
    })

    expect(result).toBe('cloudinary-storage-plugin-test/photo')
  })

  it('falls back to originalDoc.filename on update without a new file', async () => {
    const config = await buildConfig()
    const media = config.collections!.find((c) => c.slug === 'media')!
    const field = findField(media, 'cloudinaryPublicId')

    const result = await runFieldBeforeChange(field!.hooks!.beforeChange![0], {
      data: {},
      originalDoc: { filename: 'photo.jpg', mimeType: 'image/jpeg' },
      value: 'cloudinary-storage-plugin-test/photo',
    })

    expect(result).toBe('cloudinary-storage-plugin-test/photo')
  })

  it('does not touch collections that are not configured for cloudinary', async () => {
    const other: CollectionConfig = { slug: 'pages', fields: [] }
    const incoming = {
      collections: [mediaCollection, other],
    } as unknown as Config

    const config = await payloadCloudinaryPlugin(baseOptions)(incoming)

    const pages = config.collections?.find((c) => c.slug === 'pages')
    expect(pages && findField(pages, 'cloudinaryPublicId')).toBeUndefined()
  })
})
