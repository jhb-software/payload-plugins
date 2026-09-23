import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { v2 as cloudinary } from 'cloudinary'
import crypto from 'crypto'
import { APIError, type PayloadHandler } from 'payload'
import {
  assertClientUploadAllowed,
  assertClientUploadFileSize,
  createClientUploadReceipt,
} from 'payload/internal'

import type {
  CloudinarySignatureResponse,
  PendingClientUploadContext,
} from './client/CloudinaryClientUploadHandler.js'

import { assertClientUploadAccess, normalizeFolder } from './utilities/clientUploadAccess.js'
import { generatePublicId } from './utilities/generatePublicId.js'

type Args = {
  access?: ClientUploadsAccess
  apiSecret: string
  /** Prefix by slug of every collection this plugin manages. Signatures may only be requested for these. */
  collectionPrefixes: Record<string, string>
  folder?: string
  useFilename?: boolean
}

type SignatureBody = {
  filename: string
  mimeType?: string
  size: number
}

function parseBody(body: unknown): SignatureBody {
  if (!body || typeof body !== 'object') {
    throw new APIError('Invalid upload signature request.', 400)
  }

  const { filename, mimeType, size } = body as Record<string, unknown>

  if (typeof filename !== 'string' || (mimeType !== undefined && typeof mimeType !== 'string')) {
    throw new APIError('Invalid upload signature request.', 400)
  }
  assertClientUploadFileSize(size)

  return { filename, mimeType, size: size as number }
}

// eslint-disable-next-line no-control-regex
const unsafeFilenameCharacters = /[/\u0000-\u001f\u007f]/g

/** Builds the part of the public id Cloudinary stores below the folder. */
function mintPublicId({
  filename,
  prefix,
  useFilename,
}: {
  filename: string
  prefix: string
  useFilename?: boolean
}): string {
  if (!useFilename) {
    return `${prefix}${crypto.randomBytes(16).toString('hex')}`
  }
  const safeName = filename.trim().replace(unsafeFilenameCharacters, '_')
  // The random suffix keeps uploads of the same filename from colliding.
  return `${generatePublicId(prefix, safeName)}-${crypto.randomBytes(4).toString('hex')}`
}

/**
 * Returns a Payload handler that prepares a browser upload to Cloudinary: it mints the public id,
 * signs the upload parameters, and issues a pending receipt that binds the id to the user,
 * collection, filename, and MIME type. The confirm endpoint only accepts uploads under that id.
 * It is only used when clientUploads is enabled.
 */
export const getGenerateSignature =
  ({ access, apiSecret, collectionPrefixes, folder, useFilename }: Args): PayloadHandler =>
  async (req) => {
    const collectionSlug = await assertClientUploadAccess({
      access,
      collections: Object.keys(collectionPrefixes),
      req,
    })

    const { filename, mimeType } = parseBody(await req.json?.().catch(() => undefined))

    assertClientUploadAllowed({
      collection: req.payload.collections[collectionSlug]?.config,
      filename,
      mimeType,
    })

    // When both `folder` and `public_id` are sent, Cloudinary stores the asset as
    // `folder/public_id`. So the browser sends the id without the folder, while the pending
    // receipt carries the full id, which is what Cloudinary returns and the confirm step compares.
    const normalizedFolder = folder ? normalizeFolder(folder) : ''
    const publicId = mintPublicId({
      filename,
      prefix: collectionPrefixes[collectionSlug] ?? '',
      useFilename,
    })
    const fullPublicId = normalizedFolder ? `${normalizedFolder}/${publicId}` : publicId

    // Cloudinary defaults signed uploads to `overwrite=true`, which would let a signature replace
    // any existing asset under the same id.
    const params = {
      ...(normalizedFolder ? { folder: normalizedFolder } : {}),
      overwrite: 'false' as const,
      public_id: publicId,
      timestamp: Math.round(Date.now() / 1000),
    }

    const pendingReceipt = createClientUploadReceipt({
      collectionSlug,
      context: {
        mimeType: mimeType ?? '',
        publicId: fullPublicId,
      } satisfies PendingClientUploadContext,
      filename,
      req,
    })

    return Response.json({
      folder: params.folder,
      overwrite: params.overwrite,
      pendingReceipt,
      publicId,
      signature: cloudinary.utils.api_sign_request(params, apiSecret),
      timestamp: params.timestamp,
    } satisfies CloudinarySignatureResponse)
  }
