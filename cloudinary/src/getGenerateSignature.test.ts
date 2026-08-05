import { v2 as cloudinary } from 'cloudinary'
import { Forbidden, type PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { getGenerateSignature } from './getGenerateSignature.js'

const apiSecret = 'test-secret'
const timestamp = Math.round(Date.now() / 1000).toString()

function makeReq({
  body,
  collectionSlug = 'media',
  createAccess,
  user = { id: '1' },
}: {
  body: unknown
  collectionSlug?: null | string
  createAccess?: () => boolean | Promise<boolean>
  user?: unknown
}): PayloadRequest {
  return {
    json: () => Promise.resolve(body),
    payload: {
      collections: {
        [collectionSlug ?? 'media']: {
          config: { access: createAccess ? { create: createAccess } : {} },
        },
      },
    },
    searchParams: new URLSearchParams(collectionSlug ? { collectionSlug } : {}),
    user,
  } as unknown as PayloadRequest
}

async function callHandler(args: {
  access?: () => boolean | Promise<boolean>
  body: unknown
  collectionSlug?: null | string
  createAccess?: () => boolean | Promise<boolean>
  folder?: string
  user?: unknown
}): Promise<Response> {
  // Param/folder/timestamp tests allow access by default to isolate those checks.
  const handler = getGenerateSignature({
    access: args.access ?? (() => true),
    apiSecret,
    collections: ['media'],
    folder: args.folder,
  })
  return handler(makeReq(args))
}

describe('getGenerateSignature signing oracle protection', () => {
  it('signs the legitimate {timestamp, folder, public_id} params an upload sends', async () => {
    const paramsToSign = { folder: 'media', public_id: 'media/photo', timestamp }
    const res = await callHandler({ body: { paramsToSign }, folder: 'media' })

    expect(res.status).toBe(200)
    const { signature } = await res.json()
    expect(signature).toBe(cloudinary.utils.api_sign_request(paramsToSign, apiSecret))
  })

  it.each([
    ['overwrite', { overwrite: 'true', public_id: 'victim', timestamp }],
    ['type', { type: 'private', public_id: 'admin-document', timestamp }],
    ['notification_url', { notification_url: 'http://attacker.example.com/exfil', timestamp }],
    ['invalidate', { invalidate: 'true', public_id: 'cached', timestamp }],
  ])('rejects a request that includes the non-allowlisted "%s" parameter', async (_key, params) => {
    await expect(callHandler({ body: { paramsToSign: params } })).rejects.toThrow(Forbidden)
  })

  it('rejects a folder that does not match the configured folder', async () => {
    await expect(
      callHandler({
        body: { paramsToSign: { folder: 'other-collection', timestamp } },
        folder: 'media',
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('accepts a signed folder whose surrounding slashes match the configured folder', async () => {
    const res = await callHandler({
      body: { paramsToSign: { folder: '/media/', timestamp } },
      folder: '/media/',
    })
    expect(res.status).toBe(200)
  })

  it('rejects a folder when the plugin has no folder configured', async () => {
    await expect(
      callHandler({ body: { paramsToSign: { folder: 'attacker', timestamp } } }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a request without a timestamp', async () => {
    await expect(
      callHandler({ body: { paramsToSign: { folder: 'media', public_id: 'media/photo' } } }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a stale timestamp outside the freshness window', async () => {
    await expect(
      callHandler({
        body: { paramsToSign: { folder: 'media', timestamp: '1700000000' } },
        folder: 'media',
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a signature request for a collection the plugin does not manage', async () => {
    await expect(
      callHandler({
        body: { paramsToSign: { folder: 'media', timestamp } },
        collectionSlug: 'unmanaged',
        folder: 'media',
      }),
    ).rejects.toThrow(Forbidden)
  })
})

describe('getGenerateSignature default access', () => {
  async function callWithDefaultAccess(args: {
    createAccess?: () => boolean | Promise<boolean>
    user?: unknown
  }): Promise<Response> {
    const handler = getGenerateSignature({ apiSecret, collections: ['media'], folder: 'media' })
    return handler(
      makeReq({
        body: { paramsToSign: { folder: 'media', timestamp } },
        createAccess: args.createAccess,
        user: args.user,
      }),
    )
  }

  it('denies a user who lacks create access to the target collection', async () => {
    await expect(callWithDefaultAccess({ createAccess: () => false })).rejects.toThrow(Forbidden)
  })

  it('allows a user who has create access to the target collection', async () => {
    const res = await callWithDefaultAccess({ createAccess: () => true })
    expect(res.status).toBe(200)
  })

  it('denies an anonymous user when the collection defines no create access', async () => {
    await expect(callWithDefaultAccess({ user: null })).rejects.toThrow(Forbidden)
  })

  it('allows an authenticated user when the collection defines no create access', async () => {
    const res = await callWithDefaultAccess({ user: { id: '1' } })
    expect(res.status).toBe(200)
  })
})
