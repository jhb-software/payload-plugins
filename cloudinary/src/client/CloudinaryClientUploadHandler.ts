'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

import { generatePublicId } from '../utilities/generatePublicId.js'

export type CloudinaryClientUploadHandlerExtra = {
  apiKey: string
  cloudName: string
  /** Path of the endpoint that verifies the Cloudinary upload and issues a Payload receipt. */
  confirmHandlerPath: string
  folder?: string
  prefix: string
  useFilename?: boolean
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

// Params to sign: all request params except file, cloud_name, resource_type, api_key
// see https://cloudinary.com/documentation/authentication_signatures#manual_signature_generation
function buildParamsToSign({
  folder,
  publicId,
  timestamp,
}: {
  folder?: string
  publicId?: string
  timestamp: string
}): Record<string, string> {
  const params: Record<string, string> = { timestamp }
  if (folder) {
    params.folder = folder
  }
  if (publicId) {
    params.public_id = publicId
  }
  return params
}

async function getSignature(
  paramsToSign: Record<string, string>,
  serverHandlerPath: string,
  serverURL: string,
  apiRoute: string,
  collectionSlug: string,
): Promise<string> {
  const response = await fetch(
    `${serverURL}${apiRoute}${serverHandlerPath}?collectionSlug=${collectionSlug}`,
    {
      body: JSON.stringify({
        paramsToSign,
      }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )

  const data = await response.json()

  if (!data.signature) {
    throw new Error('No signature found')
  }

  return data.signature
}

async function confirmUpload({
  apiRoute,
  collectionSlug,
  confirmHandlerPath,
  filename,
  response,
  serverURL,
}: {
  apiRoute: string
  collectionSlug: string
  confirmHandlerPath: string
  filename: string
  response: CloudinaryUploadResponse
  serverURL: string
}): Promise<ClientUploadContext> {
  const res = await fetch(
    `${serverURL}${apiRoute}${confirmHandlerPath}?collectionSlug=${collectionSlug}`,
    {
      body: JSON.stringify({
        filename,
        format: response.format,
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
  paramsToSign,
  signature,
}: {
  apiKey: string
  file: Blob | File
  paramsToSign: Record<string, string>
  signature: string
}): FormData {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', apiKey)

  for (const [key, value] of Object.entries(paramsToSign)) {
    formData.append(key, value)
  }

  formData.append('resource_type', 'auto')
  formData.append('signature', signature)

  return formData
}

export const CloudinaryClientUploadHandler: ReturnType<
  typeof createClientUploadHandler<CloudinaryClientUploadHandlerExtra>
> = createClientUploadHandler<CloudinaryClientUploadHandlerExtra>({
  handler: async ({ apiRoute, collectionSlug, extra, file, serverHandlerPath, serverURL }) => {
    const { apiKey, cloudName, confirmHandlerPath, folder, prefix, useFilename } = extra
    const getReceipt = (response: CloudinaryUploadResponse) =>
      confirmUpload({
        apiRoute,
        collectionSlug,
        confirmHandlerPath,
        filename: file.name,
        response,
        serverURL,
      })

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`
    const timestamp = Math.round(new Date().getTime() / 1000).toString()
    const publicId = useFilename ? generatePublicId(prefix, file.name) : undefined

    const paramsToSign = buildParamsToSign({ folder, publicId, timestamp })
    const signature = await getSignature(
      paramsToSign,
      serverHandlerPath,
      serverURL,
      apiRoute,
      collectionSlug,
    )

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

        const formData = buildFormData({ apiKey, file: chunk, paramsToSign, signature })

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
    const formData = buildFormData({ apiKey, file, paramsToSign, signature })

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
