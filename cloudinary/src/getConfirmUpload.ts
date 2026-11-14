import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { v2 as cloudinary } from 'cloudinary'
import crypto from 'crypto'
import { APIError, Forbidden, type PayloadHandler } from 'payload'
import { createClientUploadReceipt, verifyClientUploadReceipt } from 'payload/internal'

import type {
  PendingClientUploadContext,
  VerifiedClientUploadContext,
} from './client/CloudinaryClientUploadHandler.js'

import { assertClientUploadAccess } from './utilities/clientUploadAccess.js'

type Args = {
  access?: ClientUploadsAccess
  apiSecret: string
  cloudName: string
  /** Slugs of the collections this plugin manages. Uploads may only be confirmed for these. */
  collections: string[]
}

type ResourceType = 'image' | 'raw' | 'video'

type ConfirmBody = {
  format?: string
  pendingReceipt: string
  publicId: string
  resourceType: ResourceType
  signature: string
  version: string
}

/** The SDK types omit the optional algorithm and signature-version arguments. */
const apiSignRequest = cloudinary.utils.api_sign_request as (
  params: Record<string, string>,
  apiSecret: string,
  signatureAlgorithm: null | string,
  signatureVersion: number,
) => string

const resourceTypes = new Set(['image', 'raw', 'video'])

function parseBody(body: unknown): ConfirmBody {
  const invalid = () => new APIError('Invalid upload confirmation.', 400)

  if (!body || typeof body !== 'object') {
    throw invalid()
  }

  const { format, pendingReceipt, publicId, resourceType, signature, version } = body as Record<
    string,
    unknown
  >

  const versionString =
    typeof version === 'number' && Number.isSafeInteger(version)
      ? String(version)
      : typeof version === 'string' && /^\d+$/.test(version)
        ? version
        : undefined

  if (
    typeof pendingReceipt !== 'string' ||
    !pendingReceipt ||
    typeof signature !== 'string' ||
    !signature ||
    !versionString ||
    Number(versionString) <= 0 ||
    typeof resourceType !== 'string' ||
    !resourceTypes.has(resourceType) ||
    (format !== undefined && (typeof format !== 'string' || !/^[a-z0-9]{1,16}$/i.test(format))) ||
    typeof publicId !== 'string' ||
    !publicId
  ) {
    throw invalid()
  }

  return {
    format,
    pendingReceipt,
    publicId,
    resourceType: resourceType as ResourceType,
    signature,
    version: versionString,
  }
}

function isPendingContext(context: unknown): context is PendingClientUploadContext {
  return (
    !!context &&
    typeof context === 'object' &&
    typeof (context as PendingClientUploadContext).publicId === 'string' &&
    typeof (context as PendingClientUploadContext).mimeType === 'string'
  )
}

/**
 * The resource type Cloudinary assigns to an upload with `resource_type: auto`. PDF and PostScript
 * files are stored as images, audio as video.
 */
function expectedResourceType(mimeType: string): ResourceType {
  const essence = mimeType.split(';', 1)[0].trim().toLowerCase()
  if (
    essence.startsWith('image/') ||
    essence === 'application/pdf' ||
    essence === 'application/postscript'
  ) {
    return 'image'
  }
  if (essence.startsWith('video/') || essence.startsWith('audio/')) {
    return 'video'
  }
  return 'raw'
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

/**
 * Returns a Payload handler that confirms a browser upload to Cloudinary and issues a Payload
 * client-upload receipt for it. Core only accepts client uploads that carry such a receipt, so the
 * document can only reference assets this endpoint verified.
 */
export const getConfirmUpload =
  ({ access, apiSecret, cloudName, collections }: Args): PayloadHandler =>
  async (req) => {
    const collectionSlug = await assertClientUploadAccess({ access, collections, req })

    const { format, pendingReceipt, publicId, resourceType, signature, version } = parseBody(
      await req.json?.().catch(() => undefined),
    )

    // Issued by the signature endpoint for this user and collection. Throws on a forged, expired,
    // or foreign receipt.
    const receipt = verifyClientUploadReceipt({
      collectionSlug,
      req,
      signedReceipt: pendingReceipt,
    })
    if (!receipt || !isPendingContext(receipt.context)) {
      throw new APIError('Invalid or expired client upload reference.', 400)
    }

    // Only the id the server minted may be confirmed, so a signed response for any other asset in
    // the cloud cannot be attached to a document.
    if (receipt.context.publicId !== publicId) {
      throw new Forbidden()
    }

    // Cloudinary signs every upload response over {public_id, version} with the API secret,
    // which proves the asset exists in this cloud under that id.
    const expectedSignature = apiSignRequest({ public_id: publicId, version }, apiSecret, null, 1)
    if (!signaturesMatch(signature, expectedSignature)) {
      throw new Forbidden()
    }

    // An empty MIME type is only signed for collections that allow restricted file types, where
    // Cloudinary's classification cannot be predicted.
    if (
      receipt.context.mimeType &&
      expectedResourceType(receipt.context.mimeType) !== resourceType
    ) {
      throw new APIError('The resource type does not match the uploaded file.', 400)
    }

    // `format` is client-claimed and only affects the URL extension; a wrong value makes the static
    // handler's fetch fail. Mirrors core's restricted file type check for the served extension.
    const upload = req.payload.collections[collectionSlug]?.config?.upload
    const allowRestrictedFileTypes = typeof upload === 'object' && upload.allowRestrictedFileTypes
    if (format && ['svg', 'xml'].includes(format.toLowerCase()) && !allowRestrictedFileTypes) {
      throw new APIError('SVG and XML files must be uploaded through Payload.', 400)
    }

    const secureUrl = cloudinary.url(publicId, {
      type: 'upload',
      cloud_name: cloudName,
      // Raw assets are addressed by their public id alone.
      format: resourceType === 'raw' ? undefined : format,
      resource_type: resourceType,
      secure: true,
      urlAnalytics: false,
      version,
    })

    const signedReceipt = createClientUploadReceipt({
      collectionSlug,
      context: { publicId, secureUrl } satisfies VerifiedClientUploadContext,
      filename: receipt.filename,
      req,
    })

    return Response.json({ signedReceipt })
  }
