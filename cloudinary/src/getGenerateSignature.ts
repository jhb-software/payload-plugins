import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { v2 as cloudinary } from 'cloudinary'
import { Forbidden, type PayloadHandler } from 'payload'

import { assertClientUploadAccess, normalizeFolder } from './utilities/clientUploadAccess.js'

type Args = {
  access?: ClientUploadsAccess
  apiSecret: string
  /** Slugs of the collections this plugin manages. Signatures may only be requested for these. */
  collections: string[]
  /** The configured upload folder. When set, the signed `folder` parameter must match it. */
  folder?: string
}

/** Reject signatures whose timestamp is too far from now to limit replay. */
const maxTimestampSkewSeconds = 60 * 60

/**
 * The only parameters the client upload handler legitimately needs signed.
 * Signing anything else (e.g. `overwrite`, `type`, `notification_url`, `invalidate`)
 * would turn this endpoint into a signing oracle for arbitrary Cloudinary uploads.
 */
const allowedParams = new Set(['folder', 'public_id', 'timestamp'])

/**
 * This returns a Payload handler function that generates a signature of the file which the client can then sent to cloudinary together with the file.
 * It is only used when clientUploads is enabled.
 */
export const getGenerateSignature =
  ({ access, apiSecret, collections, folder }: Args): PayloadHandler =>
  async (rawReq) => {
    if (!rawReq) {
      return new Response(JSON.stringify({ error: 'No request provided' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const req = rawReq

    await assertClientUploadAccess({ access, collections, req })

    const body = await req.json?.()

    if (!body?.paramsToSign) {
      return new Response(JSON.stringify({ error: 'No paramsToSign provided' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const paramsToSign = body.paramsToSign as Record<string, unknown>

    // Only sign the parameters a legitimate client upload sends. Anything else
    // (overwrite, type, notification_url, invalidate, …) would let an authenticated
    // user mint signatures for unauthorized uploads.
    if (Object.keys(paramsToSign).some((key) => !allowedParams.has(key))) {
      throw new Forbidden()
    }

    // A real upload signature always carries a recent timestamp. Rejecting stale or
    // far-future timestamps limits how long a leaked signature can be replayed.
    const timestamp = Number(paramsToSign.timestamp)
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > maxTimestampSkewSeconds
    ) {
      throw new Forbidden()
    }

    // The signed folder must match the folder the plugin is configured to upload into.
    // When no folder is configured, the legitimate client sends none, so any folder is rejected.
    const signedFolder = typeof paramsToSign.folder === 'string' ? paramsToSign.folder : ''
    const expectedFolder = folder !== undefined ? normalizeFolder(folder) : ''
    if (normalizeFolder(signedFolder) !== expectedFolder) {
      throw new Forbidden()
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret)

    return new Response(JSON.stringify({ signature }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }
