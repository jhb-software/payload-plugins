'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

export type CloudinaryClientUploadHandlerExtra = {
  apiKey: string
  cloudName: string
  /** Path of the endpoint that verifies the Cloudinary upload and issues a Payload receipt. */
  confirmHandlerPath: string
}

/** Context the browser submits with the document. Core verifies the receipt server-side. */
export type ClientUploadContext = {
  signedReceipt: string
}

/** Context core hands to hooks and the static handler once the receipt is verified. */
export type VerifiedClientUploadContext = {
  publicId: string
  secureUrl: string
}

/** Context of the pending receipt the signature endpoint issues and the confirm endpoint redeems. */
export type PendingClientUploadContext = {
  mimeType: string
  /** The full public id, including the folder, that Cloudinary will store the upload under. */
  publicId: string
}

/** Upload parameters minted and signed by the signature endpoint, sent to Cloudinary verbatim. */
export type CloudinarySignatureResponse = {
  folder?: string
  overwrite: 'false'
  pendingReceipt: string
  /** Public id without the folder; Cloudinary prepends `folder` itself. */
  publicId: string
  signature: string
  timestamp: number
}

type CloudinaryUploadResponse = {
  format?: string
  public_id: string
  resource_type: string
  signature: string
  version: number
}

// 100MB threshold for chunked upload
const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024

// 20MB default chunk size (minimum is 5MB)
const DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024

async function getSignature({
  apiRoute,
  collectionSlug,
  file,
  serverHandlerPath,
  serverURL,
}: {
  apiRoute: string
  collectionSlug: string
  file: File
  serverHandlerPath: string
  serverURL: string
}): Promise<CloudinarySignatureResponse> {
  const response = await fetch(
    `${serverURL}${apiRoute}${serverHandlerPath}?collectionSlug=${collectionSlug}`,
    {
      body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )

  const data = await response.json()

  if (!response.ok || typeof data?.signature !== 'string') {
    throw new Error('Failed to sign the upload')
  }

  return data as CloudinarySignatureResponse
}

async function confirmUpload({
  apiRoute,
  collectionSlug,
  confirmHandlerPath,
  pendingReceipt,
  response,
  serverURL,
}: {
  apiRoute: string
  collectionSlug: string
  confirmHandlerPath: string
  pendingReceipt: string
  response: CloudinaryUploadResponse
  serverURL: string
}): Promise<ClientUploadContext> {
  const res = await fetch(
    `${serverURL}${apiRoute}${confirmHandlerPath}?collectionSlug=${collectionSlug}`,
    {
      body: JSON.stringify({
        format: response.format,
        pendingReceipt,
        publicId: response.public_id,
        resourceType: response.resource_type,
        signature: response.signature,
        version: response.version,
      }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )

  const data = await res.json()

  if (!res.ok || typeof data?.signedReceipt !== 'string') {
    throw new Error('Failed to confirm the upload')
  }

  return { signedReceipt: data.signedReceipt }
}

function buildFormData({
  apiKey,
  file,
  signed,
}: {
  apiKey: string
  file: Blob | File
  signed: CloudinarySignatureResponse
}): FormData {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', apiKey)
  // Exactly the parameters the server signed; anything else would invalidate the signature.
  if (signed.folder) {
    formData.append('folder', signed.folder)
  }
  formData.append('overwrite', signed.overwrite)
  formData.append('public_id', signed.publicId)
  formData.append('timestamp', String(signed.timestamp))
  formData.append('resource_type', 'auto')
  formData.append('signature', signed.signature)

  return formData
}

export const CloudinaryClientUploadHandler: ReturnType<
  typeof createClientUploadHandler<CloudinaryClientUploadHandlerExtra>
> = createClientUploadHandler<CloudinaryClientUploadHandlerExtra>({
  handler: async ({ apiRoute, collectionSlug, extra, file, serverHandlerPath, serverURL }) => {
    const { apiKey, cloudName, confirmHandlerPath } = extra

    // The server mints the public id and signs the upload parameters.
    const signed = await getSignature({
      apiRoute,
      collectionSlug,
      file,
      serverHandlerPath,
      serverURL,
    })

    const getReceipt = (response: CloudinaryUploadResponse) =>
      confirmUpload({
        apiRoute,
        collectionSlug,
        confirmHandlerPath,
        pendingReceipt: signed.pendingReceipt,
        response,
        serverURL,
      })

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`

    // Use chunked upload for files larger than 100MB
    if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
      const totalSize = file.size
      const totalChunks = Math.ceil(totalSize / DEFAULT_CHUNK_SIZE)
      const uniqueUploadId = `uqid-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

      let responseData: CloudinaryUploadResponse | null = null

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * DEFAULT_CHUNK_SIZE
        const end = Math.min(start + DEFAULT_CHUNK_SIZE, totalSize)
        const chunk = file.slice(start, end)

        const formData = buildFormData({ apiKey, file: chunk, signed })

        const response = await fetch(url, {
          body: formData,
          headers: {
            'Content-Range': `bytes ${start}-${end - 1}/${totalSize}`,
            'X-Unique-Upload-Id': uniqueUploadId,
          },
          method: 'POST',
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}/${totalChunks}: ${errorText}`)
        }

        const chunkResponse = await response.json()

        // The final chunk returns the complete response with done: true
        if (chunkIndex === totalChunks - 1 || chunkResponse.done) {
          responseData = chunkResponse
        }
      }

      if (!responseData) {
        throw new Error('No response data received from chunked upload')
      }

      return await getReceipt(responseData)
    }

    // Regular upload for smaller files
    const formData = buildFormData({ apiKey, file, signed })

    const response = await fetch(url, {
      body: formData,
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Failed to upload file')
    }

    // The receipt is sent as the 'clientUploadContext'. Core verifies it and replaces it with the
    // server-verified { publicId, secureUrl } before hooks and the static handler see it.
    return await getReceipt((await response.json()) as CloudinaryUploadResponse)
  },
})
