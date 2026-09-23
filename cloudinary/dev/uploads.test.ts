import { getPayload, type CollectionSlug, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import config from './src/payload.config'
import {
  getRecordedDestroys,
  getRecordedUploads,
  resetCloudinaryMock,
  signCloudinaryResponse,
} from './src/test/cloudinaryMock'
import { createRESTClient } from './src/test/rest'

/**
 * Runs uploads through the real Payload request pipeline and the real storage plugin hooks. Only
 * the Cloudinary SDK's uploader (see cloudinaryMock.ts) and outbound `fetch` of uploaded files are
 * faked.
 */

const folder = 'cloudinary-storage-plugin-test'
const uploadCollections: CollectionSlug[] = ['images', 'videos', 'processed-images']

let payload: Payload
let rest: ReturnType<typeof createRESTClient>
let jpeg: Buffer

/** Reads the document as stored, bypassing hooks. */
const findStored = async (collection: CollectionSlug, id: number | string) =>
  (await payload.db.findOne({
    collection,
    req: {} as never,
    where: { id: { equals: id } },
  })) as { cloudinaryPublicId?: string } | null

/**
 * `images` sets `disablePayloadAccessControl`, so cloud-storage derives its `url` from the public
 * id (via the plugin's `generateURL`) instead of keeping the URL Cloudinary returned.
 */
const cloudinaryImageURL = (publicId: string) =>
  `https://res.cloudinary.com/demo/image/upload/${publicId}`

const jpegFile = (filename: string) =>
  new File([new Uint8Array(jpeg)], filename, { type: 'image/jpeg' })

/**
 * Does what the admin panel's client upload handler and Cloudinary do between them: sign the
 * upload, "upload" it (Cloudinary answers with a signed response), then have the server confirm
 * that response and hand back a receipt the create request can carry.
 */
const confirmClientUpload = async ({
  collection,
  filename,
}: {
  collection: CollectionSlug
  filename: string
}) => {
  const clientPublicId = filename.replace(/\.[^/.]+$/, '')
  const timestamp = Math.round(Date.now() / 1000)

  const signatureResponse = await rest.postJSON(
    `cloudinary-generate-signature?collectionSlug=${collection}`,
    { paramsToSign: { folder, public_id: clientPublicId, timestamp } },
  )
  expect(signatureResponse.status).toBe(200)

  // Cloudinary stores the asset under folder + public id and signs its response with the API secret.
  const publicId = `${folder}/${clientPublicId}`
  const version = 1
  const responseSignature = signCloudinaryResponse({ publicId, version })

  const confirmResponse = await rest.postJSON(
    `cloudinary-confirm-upload?collectionSlug=${collection}`,
    {
      filename,
      format: 'jpg',
      publicId,
      resourceType: 'image',
      signature: responseSignature,
      version,
    },
  )
  expect(confirmResponse.status).toBe(200)
  const { signedReceipt } = (await confirmResponse.json()) as { signedReceipt: string }
  expect(typeof signedReceipt).toBe('string')

  return { publicId, signedReceipt }
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const { token } = await payload.login({
    collection: 'users',
    data: { email: 'dev@payloadcms.com', password: 'test' },
  })
  rest = createRESTClient({ config, token })

  jpeg = await sharp({
    create: { background: '#ff0000', channels: 3, height: 8, width: 8 },
  })
    .jpeg()
    .toBuffer()
})

beforeEach(async () => {
  for (const collection of uploadCollections) {
    await payload.db.deleteMany({ collection, where: {} })
  }
  resetCloudinaryMock()

  // Stands in for any remote host serving the uploaded bytes (Cloudinary, or whatever URL a
  // client claims). Payload fetches a client-uploaded file through the plugin's static handler.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array(jpeg), {
          headers: { 'Content-Length': String(jpeg.length), 'Content-Type': 'image/jpeg' },
        }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  if (payload) {
    for (const collection of uploadCollections) {
      await payload.db.deleteMany({ collection, where: {} })
    }
    await payload.db.destroy?.()
  }
})

describe('server uploads', () => {
  test('stores the Cloudinary public id and URL returned by the server upload', async () => {
    const response = await rest.createWithFile('images', { file: jpegFile('server-photo.jpg') })
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as { doc: { id: number | string } }

    const uploads = getRecordedUploads()
    expect(uploads).toHaveLength(1)
    expect(uploads[0].options.folder).toMatch(new RegExp(`^${folder}/?$`))
    expect(uploads[0].bytes).toBe(jpeg.length)

    const stored = await findStored('images', doc.id)
    expect(stored?.cloudinaryPublicId).toBe(`${folder}/server-photo`)
    expect((await payload.findByID({ collection: 'images', id: doc.id })).url).toBe(
      cloudinaryImageURL(`${folder}/server-photo`),
    )
  })

  test('deleting a document destroys its Cloudinary asset', async () => {
    const response = await rest.createWithFile('images', { file: jpegFile('to-delete.jpg') })
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as { doc: { id: number | string } }
    const stored = await findStored('images', doc.id)
    expect(stored?.cloudinaryPublicId).toBeTruthy()

    await payload.delete({ collection: 'images', id: doc.id })

    expect(getRecordedDestroys().map((destroy) => destroy.publicId)).toEqual([
      stored?.cloudinaryPublicId,
    ])
  })
})

describe('client uploads', () => {
  test('rejects a client upload whose context was not issued by the server', async () => {
    const response = await rest.createWithClientUpload('images', {
      file: {
        clientUploadContext: { publicId: 'evil/id', secureUrl: 'https://attacker.example/x' },
        filename: 'evil.jpg',
        mimeType: 'image/jpeg',
        size: jpeg.length,
      },
    })

    expect(response.status).toBe(400)
    expect((await payload.count({ collection: 'images' })).totalDocs).toBe(0)
  })

  test('accepts a client upload confirmed through the server-issued receipt', async () => {
    const filename = 'client-photo.jpg'
    const { publicId, signedReceipt } = await confirmClientUpload({
      collection: 'images',
      filename,
    })

    const response = await rest.createWithClientUpload('images', {
      file: {
        clientUploadContext: { signedReceipt },
        filename,
        mimeType: 'image/jpeg',
        size: jpeg.length,
      },
    })
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as { doc: { id: number | string } }

    const stored = await findStored('images', doc.id)
    expect(stored?.cloudinaryPublicId).toBe(publicId)
    expect((await payload.findByID({ collection: 'images', id: doc.id })).url).toBe(
      cloudinaryImageURL(publicId),
    )
    expect(getRecordedUploads()).toHaveLength(0)
  })

  test("re-uploads a processed image under the browser's public id instead of a new one", async () => {
    const filename = 'processed-photo.jpg'
    const { publicId, signedReceipt } = await confirmClientUpload({
      collection: 'processed-images',
      filename,
    })

    const response = await rest.createWithClientUpload('processed-images', {
      file: {
        clientUploadContext: { signedReceipt },
        filename,
        mimeType: 'image/jpeg',
        size: jpeg.length,
      },
    })
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as { doc: { id: number | string } }

    const uploads = getRecordedUploads()
    expect(uploads).toHaveLength(1)
    expect(uploads[0].options.public_id).toBe(publicId)
    expect(uploads[0].options.overwrite).toBe(true)
    expect(uploads[0].options.folder).toBeFalsy()

    const stored = await findStored('processed-images', doc.id)
    expect(stored?.cloudinaryPublicId).toBe(publicId)
  })
})
