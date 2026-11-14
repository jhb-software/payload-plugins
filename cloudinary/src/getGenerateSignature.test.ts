import { v2 as cloudinary } from 'cloudinary'
import { APIError, Forbidden, type PayloadRequest } from 'payload'
import { verifyClientUploadReceipt } from 'payload/internal'
import { describe, expect, it } from 'vitest'

import { getGenerateSignature } from './getGenerateSignature.js'

const apiSecret = 'test-secret'

type AccessFn = () => boolean | Promise<boolean>

function makeReq({
  allowRestrictedFileTypes,
  body,
  collectionSlug = 'media',
  createAccess = () => true,
  updateAccess = () => false,
  user = { id: '1', collection: 'users' },
}: {
  allowRestrictedFileTypes?: boolean
  body: unknown
  collectionSlug?: null | string
  createAccess?: AccessFn
  updateAccess?: AccessFn
  user?: unknown
}): PayloadRequest {
  return {
    json: () => Promise.resolve(body),
    payload: {
      collections: {
        [collectionSlug ?? 'media']: {
          config: {
            access: { create: createAccess, update: updateAccess },
            upload: { allowRestrictedFileTypes },
          },
        },
      },
      secret: 'payload-secret',
    },
    searchParams: new URLSearchParams(collectionSlug ? { collectionSlug } : {}),
    user,
  } as unknown as PayloadRequest
}

const photo = { filename: 'photo.jpg', mimeType: 'image/jpeg', size: 1024 }

type SignatureResponse = {
  folder?: string
  overwrite: string
  pendingReceipt: string
  publicId: string
  signature: string
  timestamp: number
}

async function sign(
  args: {
    access?: AccessFn
    allowRestrictedFileTypes?: boolean
    body?: unknown
    collectionPrefixes?: Record<string, string>
    collectionSlug?: null | string
    createAccess?: AccessFn
    folder?: string
    updateAccess?: AccessFn
    useFilename?: boolean
    user?: unknown
  } = {},
): Promise<{ data: SignatureResponse; req: PayloadRequest; res: Response }> {
  const handler = getGenerateSignature({
    access: args.access,
    apiSecret,
    collectionPrefixes: args.collectionPrefixes ?? { media: '' },
    folder: 'folder' in args ? args.folder : 'media',
    useFilename: args.useFilename ?? true,
  })
  const req = makeReq({ ...args, body: 'body' in args ? args.body : photo })
  const res = await handler(req)
  return { data: (await res.clone().json()) as SignatureResponse, req, res }
}

/** The parameters the browser forwards to Cloudinary, exactly as the endpoint returned them. */
const uploadParams = (data: SignatureResponse) => ({
  ...(data.folder ? { folder: data.folder } : {}),
  overwrite: data.overwrite,
  public_id: data.publicId,
  timestamp: data.timestamp,
})

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((err: unknown) => err)
  expect(error).toBeInstanceOf(APIError)
  expect(error).toMatchObject({ status })
}

describe('getGenerateSignature upload parameters', () => {
  it('signs overwrite=false', async () => {
    const { data, res } = await sign()

    expect(res.status).toBe(200)
    expect(data.overwrite).toBe('false')
    expect(data.signature).toBe(cloudinary.utils.api_sign_request(uploadParams(data), apiSecret))
  })

  it('signs a fresh server-side timestamp', async () => {
    const { data } = await sign()

    expect(Math.abs(Date.now() / 1000 - data.timestamp)).toBeLessThan(5)
  })

  it('mints distinct public ids for the same filename', async () => {
    const first = await sign()
    const second = await sign()

    expect(first.data.publicId).not.toBe(second.data.publicId)
  })

  it('derives the public id from the filename and collection prefix plus a random suffix', async () => {
    const { data } = await sign({ collectionPrefixes: { media: 'uploads-' } })

    expect(data.folder).toBe('media')
    expect(data.publicId).toMatch(/^uploads-photo-[0-9a-f]{8}$/)
  })

  it('replaces characters Cloudinary does not allow and slashes in the filename', async () => {
    const { data } = await sign({
      body: { ...photo, filename: ' ../photo+1#2.jpg ' },
    })

    expect(data.publicId).toMatch(/^\.\._photo_1_2-[0-9a-f]{8}$/)
  })

  it('mints a random public id when useFilename is off', async () => {
    const { data } = await sign({ collectionPrefixes: { media: 'uploads-' }, useFilename: false })

    expect(data.publicId).toMatch(/^uploads-[0-9a-f]{32}$/)
  })

  it('omits the folder when none is configured', async () => {
    const { data } = await sign({ folder: undefined })

    expect(data.folder).toBeUndefined()
    expect(data.signature).toBe(cloudinary.utils.api_sign_request(uploadParams(data), apiSecret))
  })

  it('issues a pending receipt bound to the full public id Cloudinary will store', async () => {
    const { data, req } = await sign({ folder: '/media/' })

    const receipt = verifyClientUploadReceipt({
      collectionSlug: 'media',
      req,
      signedReceipt: data.pendingReceipt,
    })
    expect(receipt.filename).toBe('photo.jpg')
    expect(receipt.context).toEqual({
      mimeType: 'image/jpeg',
      publicId: `media/${data.publicId}`,
    })
  })
})

describe('getGenerateSignature file type checks', () => {
  it('rejects a client upload of a disallowed MIME type at signing time', async () => {
    await expectStatus(
      sign({ body: { filename: 'logo.svg', mimeType: 'image/svg+xml', size: 10 } }),
      400,
    )
  })

  it('signs an svg upload for a collection that allows restricted file types', async () => {
    const { res } = await sign({
      allowRestrictedFileTypes: true,
      body: { filename: 'logo.svg', mimeType: 'image/svg+xml', size: 10 },
    })

    expect(res.status).toBe(200)
  })

  it.each([
    ['a missing filename', { mimeType: 'image/jpeg', size: 1 }],
    ['a non-string MIME type', { filename: 'photo.jpg', mimeType: 5, size: 1 }],
    ['a negative size', { filename: 'photo.jpg', mimeType: 'image/jpeg', size: -1 }],
    ['a non-object body', 'photo.jpg'],
  ])('rejects a body with %s', async (_label, body) => {
    await expectStatus(sign({ body }), 400)
  })
})

describe('getGenerateSignature access', () => {
  it('rejects a request without a collectionSlug', async () => {
    await expectStatus(sign({ collectionSlug: null }), 400)
  })

  it('rejects a signature request for a collection the plugin does not manage', async () => {
    await expect(sign({ collectionSlug: 'unmanaged' })).rejects.toThrow(Forbidden)
  })

  it('rejects an unauthenticated caller even when the custom access rule allows everyone', async () => {
    await expect(sign({ access: () => true, user: null })).rejects.toThrow(Forbidden)
  })

  it('rejects a user who can neither create nor update documents in the collection', async () => {
    await expect(sign({ createAccess: () => false })).rejects.toThrow(Forbidden)
  })

  it('allows a user who may only update documents in the collection', async () => {
    const { res } = await sign({ createAccess: () => false, updateAccess: () => true })

    expect(res.status).toBe(200)
  })

  it('rejects a user the custom access rule denies', async () => {
    await expect(sign({ access: () => false })).rejects.toThrow(Forbidden)
  })
})
