import { getPayload, type CollectionSlug, type Payload } from 'payload'
import { UPLOAD_CONTENT_SECURITY_POLICY } from 'payload/internal'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import config from './src/payload.config'
import {
  getRecordedDestroys,
  fakeSignedBrowserUpload,
  getRecordedUploads,
  resetCloudinaryMock,
} from './src/test/cloudinaryMock'
import { createRESTClient } from './src/test/rest'

/**
 * Runs uploads through the real Payload request pipeline and the real storage plugin hooks. Only
 * the Cloudinary SDK's uploader (see cloudinaryMock.ts) and outbound `fetch` of uploaded files are
 * faked.
 */

const folder = 'cloudinary-storage-plugin-test'
const uploadCollections: CollectionSlug[] = [
  'images',
  'videos',
  'processed-images',
  'vector-images',
]

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
 * Does what the admin panel's client upload handler and Cloudinary do between them: request a
 * signature (the server mints the public id and a pending receipt), upload with exactly the
 * returned parameters (Cloudinary answers with a signed response), then have the server confirm
 * that response and hand back a receipt the create request can carry.
 */
const confirmClientUpload = async ({
  collection,
  filename,
}: {
  collection: CollectionSlug
  filename: string
}) => {
  const signatureResponse = await rest.postJSON(
    `cloudinary-generate-signature?collectionSlug=${collection}`,
    { filename, mimeType: 'image/jpeg', size: jpeg.length },
  )
  expect(signatureResponse.status).toBe(200)
  const signed = (await signatureResponse.json()) as {
    folder?: string
    overwrite: string
    pendingReceipt: string
    publicId: string
    signature: string
    timestamp: number
  }

  const cloudinaryResponse = fakeSignedBrowserUpload({
    params: {
      folder: signed.folder,
      overwrite: signed.overwrite,
      public_id: signed.publicId,
      timestamp: signed.timestamp,
    },
    signature: signed.signature,
  })

  const confirmResponse = await rest.postJSON(
    `cloudinary-confirm-upload?collectionSlug=${collection}`,
    {
      format: cloudinaryResponse.format,
      pendingReceipt: signed.pendingReceipt,
      publicId: cloudinaryResponse.public_id,
      resourceType: cloudinaryResponse.resource_type,
      signature: cloudinaryResponse.signature,
      version: cloudinaryResponse.version,
    },
  )
  expect(confirmResponse.status).toBe(200)
  const { signedReceipt } = (await confirmResponse.json()) as { signedReceipt: string }
  expect(typeof signedReceipt).toBe('string')

  return { publicId: cloudinaryResponse.public_id, signedReceipt }
}

/** Stands in for a remote host serving `bytes`, honouring `Range` requests like Cloudinary does. */
const serveBytes = (bytes: Uint8Array, contentType: string) =>
  vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(new Headers(init?.headers).get('Range') ?? '')
    if (range) {
      const start = Number(range[1])
      const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
      return new Response(bytes.slice(start, end + 1), {
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
          'Content-Type': contentType,
        },
        status: 206,
      })
    }
    return new Response(bytes.slice(), {
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(bytes.length),
        'Content-Type': contentType,
      },
    })
  })

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
  vi.stubGlobal('fetch', serveBytes(new Uint8Array(jpeg), 'image/jpeg'))
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

  test('ignores a caller-supplied cloudinaryPublicId on update', async () => {
    const response = await rest.createWithFile('images', { file: jpegFile('locked.jpg') })
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as { doc: { id: number | string } }
    const before = await findStored('images', doc.id)

    const update = await rest.patchJSON(`images/${doc.id}`, {
      alt: 'updated',
      cloudinaryPublicId: 'evil/id',
    })
    expect(update.status).toBe(200)

    const after = await findStored('images', doc.id)
    expect(after?.cloudinaryPublicId).toBe(before?.cloudinaryPublicId)
    expect(after?.cloudinaryPublicId).not.toBe('evil/id')
  })
})

describe('serving files', () => {
  test('forwards a Range request to Cloudinary and streams the partial response', async () => {
    const response = await rest.createWithFile('images', { file: jpegFile('ranged.jpg') })
    expect(response.status).toBe(201)

    const served = await rest.get('images/file/ranged.jpg', { Range: 'bytes=0-3' })

    expect(served.status).toBe(206)
    expect(served.headers.get('Content-Range')).toBe(`bytes 0-3/${jpeg.length}`)
    expect(served.headers.get('Content-Length')).toBe('4')
    expect(Buffer.from(await served.arrayBuffer())).toEqual(jpeg.subarray(0, 4))
  })

  test('serves the full file with its upstream length and type', async () => {
    const response = await rest.createWithFile('images', { file: jpegFile('full.jpg') })
    expect(response.status).toBe(201)

    const served = await rest.get('images/file/full.jpg')

    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/jpeg')
    expect(served.headers.get('Content-Length')).toBe(String(jpeg.length))
    expect(served.headers.get('Content-Security-Policy')).toBeNull()
    expect(Buffer.from(await served.arrayBuffer())).toEqual(jpeg)
  })

  test('serves SVG files with a restrictive Content-Security-Policy', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
    )
    const response = await rest.createWithFile('vector-images', {
      file: new File([new Uint8Array(svg)], 'logo.svg', { type: 'image/svg+xml' }),
    })
    expect(response.status).toBe(201)
    vi.stubGlobal('fetch', serveBytes(new Uint8Array(svg), 'image/svg+xml'))

    const served = await rest.get('vector-images/file/logo.svg')

    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Security-Policy')).toBe(UPLOAD_CONTENT_SECURITY_POLICY)
  })
})

describe('client uploads', () => {
  test('rejects a client upload of a disallowed MIME type at signing time', async () => {
    const response = await rest.postJSON('cloudinary-generate-signature?collectionSlug=images', {
      filename: 'logo.svg',
      mimeType: 'image/svg+xml',
      size: 100,
    })

    expect(response.status).toBe(400)
  })

  test('fetches a confirmed client upload from Cloudinary only once', async () => {
    const filename = 'fetched-once.jpg'
    const { signedReceipt } = await confirmClientUpload({ collection: 'images', filename })
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockClear()

    const response = await rest.createWithClientUpload('images', {
      file: {
        clientUploadContext: { signedReceipt },
        filename,
        mimeType: 'image/jpeg',
        size: jpeg.length,
      },
    })

    expect(response.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

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
