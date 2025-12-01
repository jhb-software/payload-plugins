import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import type { CloudinaryStorageOptions } from './index.js'

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

    if (mimeType?.startsWith('image/')) {
      return `${baseUrl}/image/upload/${cloudinaryPublicId}`
    } else if (mimeType?.startsWith('video/')) {
      return `${baseUrl}/video/upload/${cloudinaryPublicId}`
    } else {
      return `${baseUrl}/auto/upload/${cloudinaryPublicId}`
    }
  }
}
