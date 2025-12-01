'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

import { generatePublicId } from '../utilities/generatePublicId.js'

export type CloudinaryClientUploadHandlerExtra = {
  apiKey: string
  cloudName: string
  folder?: string
  prefix: string
  useFilename?: boolean
}

export type ClientUploadContext = {
  publicId: string
  secureUrl: string
}

async function getSingnature(
  paramsToSign: Record<string, unknown>,
  serverHandlerPath: string,
  serverURL: string,
  apiRoute: string,
  collectionSlug: string,
): Promise<string> {
  try {
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
  } catch (error) {
    console.error('Error getting signature', error)
    throw error
  }
}

export const CloudinaryClientUploadHandler: ReturnType<
  typeof createClientUploadHandler<CloudinaryClientUploadHandlerExtra>
> = createClientUploadHandler<CloudinaryClientUploadHandlerExtra>({
  handler: async ({ apiRoute, collectionSlug, extra, file, serverHandlerPath, serverURL }) => {
    const { apiKey, cloudName, folder, prefix, useFilename } = extra

    const formData = new FormData()
    formData.append('file', file)

    formData.append('timestamp', Math.round(new Date().getTime() / 1000).toString())
    formData.append('api_key', apiKey)

    if (folder) {
      formData.append('folder', folder)
    }

    if (useFilename) {
      formData.append('public_id', generatePublicId(prefix, file.name))
    }

    formData.append('resource_type', 'auto')

    // see https://cloudinary.com/documentation/authentication_signatures#manual_signature_generation
    const keysNotToSign = ['file', 'cloud_name', 'resource_type', 'api_key']
    const paramsToSign = Object.fromEntries(
      Array.from(formData.entries()).filter(([key]) => !keysNotToSign.includes(key)),
    )

    const signature = await getSingnature(
      paramsToSign,
      serverHandlerPath,
      serverURL,
      apiRoute,
      collectionSlug,
    )
    formData.append('signature', signature)

    // TODO: use upload_large for files larger than 100MB
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`

    const response = await fetch(url, {
      body: formData,
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Failed to upload file')
    }

    const responseData = await response.json()

    // This data is sent as the 'clientUploadContext' to the staticHandler function
    return {
      publicId: responseData.public_id,
      secureUrl: responseData.secure_url,
    } satisfies ClientUploadContext
  },
})
