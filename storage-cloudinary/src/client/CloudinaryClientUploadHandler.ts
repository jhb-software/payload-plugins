'use client'
import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

export type CloudinaryClientUploadHandlerExtra = {
  baseURL: string
  prefix: string
  folder: string
}

export type ClientUploadContext = {
  publicId: string
  secureUrl: string
}

async function getSingnature(
  paramsToSign: any,
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
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    const data = await response.json()

    if (!data.signature) {
      throw new Error('No signature found')
    }

    console.log('signature from server', data.signature)

    return data.signature
  } catch (error) {
    console.error('Error getting signature', error)
    throw error
  }
}

export const CloudinaryClientUploadHandler =
  createClientUploadHandler<CloudinaryClientUploadHandlerExtra>({
    handler: async ({
      apiRoute,
      collectionSlug,
      extra: { addRandomSuffix, baseURL, prefix = '', folder },
      file,
      serverHandlerPath,
      serverURL,
      updateFilename,
    }) => {
      console.log('CloudinaryClientUploadHandler uploading file')
      const formData = new FormData()
      formData.append('file', file)

      formData.append('timestamp', Math.round(new Date().getTime() / 1000).toString())
      formData.append('api_key', process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY!)

      if (folder) {
        formData.append('folder', folder)
      }

      const publicId = `${prefix}${file.name.replace(/\.[^/.]+$/, '')}` // append prefix to filename and remove file extension
      formData.append('public_id', publicId)

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

      const url = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/auto/upload`

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
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
