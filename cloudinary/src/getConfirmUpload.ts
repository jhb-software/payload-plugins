import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { v2 as cloudinary } from 'cloudinary'
import crypto from 'crypto'
import { APIError, Forbidden, type PayloadHandler } from 'payload'
import { createClientUploadReceipt } from 'payload/internal'

import type { VerifiedClientUploadContext } from './client/CloudinaryClientUploadHandler.js'

import { assertClientUploadAccess, normalizeFolder } from './utilities/clientUploadAccess.js'
import { generatePublicId } from './utilities/generatePublicId.js'

type Args = {
  access?: ClientUploadsAccess
  apiSecret: string
  cloudName: string
  /** Collection prefixes by slug, as the client uses them to build the public id. */
  collectionPrefixes: Record<string, string>
  /** Slugs of the collections this plugin manages. Uploads may only be confirmed for these. */
  collections: string[]
  folder?: string
  useFilename?: boolean
}

type ConfirmBody = {
  filename: string
  format?: string
  publicId: string
  resourceType: 'image' | 'raw' | 'video'
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
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f]/

function parseBody(body: unknown): ConfirmBody {
  const invalid = () => new APIError('Invalid upload confirmation.', 400)

  if (!body || typeof body !== 'object') {
    throw invalid()
  }

  const { filename, format, publicId, resourceType, signature, version } = body as Record<
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
    typeof filename !== 'string' ||
    !filename ||
    typeof signature !== 'string' ||
    !signature ||
    !versionString ||
    Number(versionString) <= 0 ||
    typeof resourceType !== 'string' ||
    !resourceTypes.has(resourceType) ||
    (format !== undefined && (typeof format !== 'string' || !/^[a-z0-9]{1,16}$/i.test(format))) ||
    typeof publicId !== 'string' ||
    !publicId ||
    publicId.startsWith('/') ||
    publicId.split('/').includes('..') ||
    controlCharacters.test(publicId)
  ) {
    throw invalid()
  }

  return {
    filename,
    format,
    publicId,
    resourceType: resourceType as ConfirmBody['resourceType'],
    signature,
    version: versionString,
  }
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
  ({
    access,
    apiSecret,
    cloudName,
    collectionPrefixes,
    collections,
    folder,
    useFilename,
  }: Args): PayloadHandler =>
  async (req) => {
    const collectionSlug = await assertClientUploadAccess({ access, collections, req })

    const { filename, format, publicId, resourceType, signature, version } = parseBody(
      await req.json?.(),
    )

    // Cloudinary signs every upload response over {public_id, version} with the API secret,
    // which proves the asset exists in this cloud and was created by Cloudinary.
    const expectedSignature = apiSignRequest({ public_id: publicId, version }, apiSecret, null, 1)
    if (!signaturesMatch(signature, expectedSignature)) {
      throw new Forbidden()
    }

    // Keep confirmations inside the plugin's namespace, so a signed response for an unrelated
    // asset in the same cloud cannot be attached to a document.
    const folderPrefix = folder ? normalizeFolder(folder) : ''
    if (folderPrefix && !publicId.startsWith(`${folderPrefix}/`)) {
      throw new Forbidden()
    }
    const publicIdInFolder = folderPrefix ? publicId.slice(folderPrefix.length + 1) : publicId
    if (
      useFilename &&
      publicIdInFolder !== generatePublicId(collectionPrefixes[collectionSlug] ?? '', filename)
    ) {
      throw new Forbidden()
    }

    const secureUrl = cloudinary.url(publicId, {
      type: 'upload',
      cloud_name: cloudName,
      // Raw public ids already contain the extension.
      format: resourceType === 'raw' ? undefined : format,
      resource_type: resourceType,
      secure: true,
      urlAnalytics: false,
      version,
    })

    const signedReceipt = createClientUploadReceipt({
      collectionSlug,
      context: { publicId, secureUrl } satisfies VerifiedClientUploadContext,
      filename,
      req,
    })

    return Response.json({ signedReceipt })
  }
