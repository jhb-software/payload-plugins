import { v2 as cloudinary } from 'cloudinary'
import { APIError, Forbidden, type PayloadRequest } from 'payload'
import { verifyClientUploadReceipt } from 'payload/internal'
import { describe, expect, it } from 'vitest'

import { getConfirmUpload } from './getConfirmUpload.js'

const apiSecret = 'test-secret'
const cloudName = 'demo'

/** Signs like Cloudinary signs upload responses: SHA-1, signature version 1. */
function signResponse(publicId: string, version: number | string): string {
  const sign = cloudinary.utils.api_sign_request as (
    params: Record<string, unknown>,
    secret: string,
    algorithm: null,
    signatureVersion: number,
  ) => string
  return sign({ public_id: publicId, version }, apiSecret, null, 1)
}

function makeReq({
  body,
  collectionSlug = 'media',
  createAccess,
  user = { id: '1', collection: 'users' },
}: {
  body: unknown
  collectionSlug?: string
  createAccess?: () => boolean
  user?: unknown
}): PayloadRequest {
  return {
    json: () => Promise.resolve(body),
    payload: {
      collections: {
        [collectionSlug]: {
          config: { access: createAccess ? { create: createAccess } : {} },
        },
      },
      secret: 'payload-secret',
    },
    searchParams: new URLSearchParams({ collectionSlug }),
    user,
  } as unknown as PayloadRequest
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const publicId = (overrides.publicId as string | undefined) ?? 'media/photo'
  const version = (overrides.version as number | undefined) ?? 1700000000
  return {
    filename: 'photo.jpg',
    format: 'jpg',
    publicId,
    resourceType: 'image',
    signature: signResponse(publicId, version),
    version,
    ...overrides,
  }
}

async function confirm(
  args: {
    access?: () => boolean
    body?: unknown
    collectionPrefixes?: Record<string, string>
    collectionSlug?: string
    createAccess?: () => boolean
    folder?: string
    useFilename?: boolean
  } = {},
): Promise<{ req: PayloadRequest; res: Response }> {
  const handler = getConfirmUpload({
    access: args.access,
    apiSecret,
    cloudName,
    collectionPrefixes: args.collectionPrefixes ?? {},
    collections: ['media'],
    folder: 'folder' in args ? args.folder : 'media',
    useFilename: args.useFilename ?? true,
  })
  const req = makeReq({
    body: args.body ?? validBody(),
    collectionSlug: args.collectionSlug,
    createAccess: args.createAccess,
  })
  return { req, res: await handler(req) }
}

async function readReceipt(req: PayloadRequest, res: Response) {
  const { signedReceipt } = await res.json()
  return verifyClientUploadReceipt({ collectionSlug: 'media', req, signedReceipt })
}

describe('getConfirmUpload', () => {
  it('issues a receipt whose verified context carries a server-built secureUrl', async () => {
    const { req, res } = await confirm()

    expect(res.status).toBe(200)
    const receipt = await readReceipt(req, res)
    expect(receipt.filename).toBe('photo.jpg')
    expect(receipt.context).toEqual({
      publicId: 'media/photo',
      secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1700000000/media/photo.jpg',
    })
  })

  it('builds a raw file URL without appending the format, since raw public ids keep their extension', async () => {
    const { req, res } = await confirm({
      body: validBody({
        filename: 'report.pdf',
        format: undefined,
        publicId: 'media/report.pdf',
        resourceType: 'raw',
      }),
      useFilename: false,
    })

    const receipt = await readReceipt(req, res)
    expect(receipt.context).toEqual({
      publicId: 'media/report.pdf',
      secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1700000000/media/report.pdf',
    })
  })

  it('rejects a forged Cloudinary signature', async () => {
    await expect(confirm({ body: validBody({ signature: 'a'.repeat(40) }) })).rejects.toThrow(
      Forbidden,
    )
  })

  it('rejects a signature issued for a different version of the asset', async () => {
    await expect(
      confirm({ body: validBody({ signature: signResponse('media/photo', 1) }) }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a public id outside the configured folder', async () => {
    await expect(confirm({ body: validBody({ publicId: 'other/photo' }) })).rejects.toThrow(
      Forbidden,
    )
  })

  it('rejects a public id that does not match the signed filename when useFilename is on', async () => {
    await expect(confirm({ body: validBody({ publicId: 'media/someone-else' }) })).rejects.toThrow(
      Forbidden,
    )
  })

  it('expects the collection prefix in the public id when useFilename is on', async () => {
    await expect(confirm({ collectionPrefixes: { media: 'uploads-' } })).rejects.toThrow(Forbidden)

    const { res } = await confirm({
      body: validBody({ publicId: 'media/uploads-photo' }),
      collectionPrefixes: { media: 'uploads-' },
    })
    expect(res.status).toBe(200)
  })

  it('matches the public id Cloudinary stores for a filename with characters it does not allow', async () => {
    const { req, res } = await confirm({
      body: validBody({ filename: 'photo+1#2.jpg', publicId: 'media/photo_1_2' }),
    })

    expect(res.status).toBe(200)
    expect((await readReceipt(req, res)).context).toMatchObject({ publicId: 'media/photo_1_2' })
  })

  it('accepts any public id inside the folder when useFilename is off', async () => {
    const { res } = await confirm({
      body: validBody({ publicId: 'media/k2jf8sd9' }),
      useFilename: false,
    })
    expect(res.status).toBe(200)
  })

  it('accepts a public id without folder when no folder is configured', async () => {
    const { res } = await confirm({ body: validBody({ publicId: 'photo' }), folder: undefined })
    expect(res.status).toBe(200)
  })

  it('rejects a confirmation for a collection the plugin does not manage', async () => {
    await expect(confirm({ access: () => true, collectionSlug: 'unmanaged' })).rejects.toThrow(
      Forbidden,
    )
  })

  it('rejects a user who lacks create access to the target collection', async () => {
    await expect(confirm({ createAccess: () => false })).rejects.toThrow(Forbidden)
  })

  it.each([
    ['a non-numeric version', { version: 'latest' }],
    ['a zero version', { version: 0 }],
    ['an unknown resource type', { resourceType: 'authenticated' }],
    ['a format with path characters', { format: 'jpg/../x' }],
    ['a public id with a parent segment', { publicId: 'media/../secret' }],
    ['a public id with a leading slash', { publicId: '/media/photo' }],
    ['a public id with control characters', { publicId: 'media/photo\n' }],
    ['a missing filename', { filename: undefined }],
  ])('rejects a body with %s', async (_label, overrides) => {
    const error = await confirm({ body: validBody(overrides), useFilename: false }).catch(
      (err: unknown) => err,
    )
    expect(error).toBeInstanceOf(APIError)
    expect(error).toMatchObject({ status: 400 })
  })
})
