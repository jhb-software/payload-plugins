import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import type { CloudinaryStorageOptions } from './types.js'

export const getGenerateUrl = ({ options }: { options: CloudinaryStorageOptions }): GenerateURL => {
  return ({ data }) => {
    const mimeType = (
      'mimeType' in data && typeof data.mimeType === 'string' ? data.mimeType : undefined
    ) as string | undefined

    if (!mimeType) {
      console.warn(
        'MimeType field is missing in data passed to the generateURL function. This can happen if a find query contains select without mimeType. Falling back to auto/upload.',
        data,
      )
    }

    const cloudinaryPublicId =
      'cloudinaryPublicId' in data && typeof data.cloudinaryPublicId === 'string'
        ? data.cloudinaryPublicId
        : undefined
    if (!cloudinaryPublicId) {
      throw new Error(
        'CloudinaryPublicId field is missing in data passed to the generateURL function. This can happen if a find query contains select without cloudinaryPublicId.',
        data,
      )
    }

    const baseUrl = 'https://res.cloudinary.com/' + options.cloudName

    let resourceType: string
    switch (true) {
      case mimeType?.startsWith('image/'):
      case mimeType === 'application/pdf': // Cloudinary treats PDFs as images
        resourceType = 'image'
        break
      case mimeType?.startsWith('video/'): // Cloudinary treats audio as a subset of video
      case mimeType?.startsWith('audio/'):
        resourceType = 'video'
        break
      default:
        resourceType = 'raw'
        break
    }

    return `${baseUrl}/${resourceType}/upload/${cloudinaryPublicId}`
  }
}
