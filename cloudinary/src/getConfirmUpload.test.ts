import { v2 as cloudinary } from 'cloudinary'
import { APIError, Forbidden, type PayloadRequest } from 'payload'
import { createClientUploadReceipt, verifyClientUploadReceipt } from 'payload/internal'
import { describe, expect, it } from 'vitest'

import { getConfirmUpload } from './getConfirmUpload.js'

const apiSecret = 'test-secret'
const cloudName = 'demo'

type AccessFn = () => boolean

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
  allowRestrictedFileTypes,
  body,
  collectionSlug = 'media',
  createAccess = () => true,
  user = { id: '1', collection: 'users' },
}: {
  allowRestrictedFileTypes?: boolean
  body?: unknown
  collectionSlug?: string
  createAccess?: AccessFn
  user?: unknown
}): PayloadRequest {
  return {
    json: () => Promise.resolve(body),
    payload: {
      collections: {
        [collectionSlug]: {
          config: {
            access: { create: createAccess, update: () => false },
            upload: { allowRestrictedFileTypes },
          },
        },
      },
      secret: 'payload-secret',
    },
    searchParams: new URLSearchParams({ collectionSlug }),
    user,
  } as unknown as PayloadRequest
}

/** A pending receipt as the signature endpoint issues it. */
function pendingReceipt({
  collectionSlug = 'media',
  filename = 'photo.jpg',
  mimeType = 'image/jpeg',
  publicId = 'media/photo-1a2b3c4d',
  user,
}: {
  collectionSlug?: string
  filename?: string
  mimeType?: string
  publicId?: string
  user?: unknown
} = {}): string {
  return createClientUploadReceipt({
    collectionSlug,
    context: { mimeType, publicId },
    filename,
    req: makeReq({ collectionSlug, user }),
  })
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const publicId = (overrides.publicId as string | undefined) ?? 'media/photo-1a2b3c4d'
  const version = (overrides.version as number | undefined) ?? 1700000000
  return {
    format: 'jpg',
    pendingReceipt: pendingReceipt({ publicId }),
    publicId,
    resourceType: 'image',
    signature: signResponse(publicId, version),
    version,
    ...overrides,
  }
}

async function confirm(
  args: {
    access?: AccessFn
    allowRestrictedFileTypes?: boolean
    body?: unknown
    collectionSlug?: string
    createAccess?: AccessFn
    user?: unknown
  } = {},
): Promise<{ req: PayloadRequest; res: Response }> {
  const handler = getConfirmUpload({
    access: args.access,
    apiSecret,
    cloudName,
    collections: ['media'],
  })
  const req = makeReq({ ...args, body: args.body ?? validBody() })
  return { req, res: await handler(req) }
}

async function readReceipt(req: PayloadRequest, res: Response) {
  const { signedReceipt } = await res.json()
  return verifyClientUploadReceipt({ collectionSlug: 'media', req, signedReceipt })
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((err: unknown) => err)
  expect(error).toBeInstanceOf(APIError)
  expect(error).toMatchObject({ status })
}

describe('getConfirmUpload', () => {
  it('issues a receipt whose verified context carries a server-built secureUrl', async () => {
    const { req, res } = await confirm()

    expect(res.status).toBe(200)
    const receipt = await readReceipt(req, res)
    expect(receipt.filename).toBe('photo.jpg')
    expect(receipt.context).toEqual({
      publicId: 'media/photo-1a2b3c4d',
      secureUrl:
        'https://res.cloudinary.com/demo/image/upload/v1700000000/media/photo-1a2b3c4d.jpg',
    })
  })

  it('builds a raw file URL without appending the format', async () => {
    const publicId = 'media/report-1a2b3c4d'
    const { req, res } = await confirm({
      body: validBody({
        format: undefined,
        pendingReceipt: pendingReceipt({
          filename: 'report.zip',
          mimeType: 'application/zip',
          publicId,
        }),
        publicId,
        resourceType: 'raw',
      }),
    })

    const receipt = await readReceipt(req, res)
    expect(receipt.filename).toBe('report.zip')
    expect(receipt.context).toEqual({
      publicId,
      secureUrl: `https://res.cloudinary.com/demo/raw/upload/v1700000000/${publicId}`,
    })
  })

  it('rejects a forged Cloudinary signature', async () => {
    await expect(confirm({ body: validBody({ signature: 'a'.repeat(40) }) })).rejects.toThrow(
      Forbidden,
    )
  })

  it('rejects a signature issued for a different version of the asset', async () => {
    await expect(
      confirm({ body: validBody({ signature: signResponse('media/photo-1a2b3c4d', 1) }) }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a confirmation for a public id the server did not mint', async () => {
    // A genuinely signed Cloudinary response for another asset in the same cloud.
    const otherId = 'media/someone-elses-photo'
    await expect(
      confirm({
        body: validBody({
          pendingReceipt: pendingReceipt(),
          publicId: otherId,
          signature: signResponse(otherId, 1700000000),
        }),
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a pending receipt issued to another user', async () => {
    await expectStatus(
      confirm({
        body: validBody({
          pendingReceipt: pendingReceipt({ user: { id: '2', collection: 'users' } }),
        }),
      }),
      400,
    )
  })

  it('rejects a pending receipt issued for another collection', async () => {
    await expectStatus(
      confirm({ body: validBody({ pendingReceipt: pendingReceipt({ collectionSlug: 'docs' }) }) }),
      400,
    )
  })

  it('rejects a confirmed upload receipt passed off as a pending one', async () => {
    const { res } = await confirm()
    const { signedReceipt } = await res.json()

    await expectStatus(confirm({ body: validBody({ pendingReceipt: signedReceipt }) }), 400)
  })

  it('rejects a resource type that does not match the signed MIME type', async () => {
    await expectStatus(confirm({ body: validBody({ resourceType: 'video' }) }), 400)
  })

  it.each([
    ['video/mp4', 'video'],
    ['audio/mpeg', 'video'],
    ['application/pdf', 'image'],
  ])('accepts a %s upload that Cloudinary stores as %s', async (mimeType, resourceType) => {
    const publicId = 'media/file-1a2b3c4d'
    const { res } = await confirm({
      body: validBody({
        format: undefined,
        pendingReceipt: pendingReceipt({ mimeType, publicId }),
        publicId,
        resourceType,
      }),
    })

    expect(res.status).toBe(200)
  })

  it('rejects an svg format on a collection that does not allow restricted file types', async () => {
    await expectStatus(confirm({ body: validBody({ format: 'SVG' }) }), 400)
  })

  it('accepts an svg format on a collection that allows restricted file types', async () => {
    const { res } = await confirm({
      allowRestrictedFileTypes: true,
      body: validBody({ format: 'svg' }),
    })

    expect(res.status).toBe(200)
  })

  it('rejects a confirmation for a collection the plugin does not manage', async () => {
    await expect(confirm({ access: () => true, collectionSlug: 'unmanaged' })).rejects.toThrow(
      Forbidden,
    )
  })

  it('rejects a user who lacks create and update access to the target collection', async () => {
    await expect(confirm({ createAccess: () => false })).rejects.toThrow(Forbidden)
  })

  it('rejects an unauthenticated caller even when the custom access rule allows everyone', async () => {
    await expect(confirm({ access: () => true, user: null })).rejects.toThrow(Forbidden)
  })

  it.each([
    ['a non-numeric version', { version: 'latest' }],
    ['a zero version', { version: 0 }],
    ['an unknown resource type', { resourceType: 'authenticated' }],
    ['a format with path characters', { format: 'jpg/../x' }],
    ['a missing public id', { publicId: undefined }],
    ['a missing pending receipt', { pendingReceipt: undefined }],
  ])('rejects a body with %s', async (_label, overrides) => {
    await expectStatus(confirm({ body: validBody(overrides) }), 400)
  })
})
