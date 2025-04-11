import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

export const getGenerateUrl = (): GenerateURL => {
  return ({ data }) => {
    if (!data || !data.cloudinarySecureUrl) {
      throw new Error('Cloudinary secure URL not found')
    }

    return data.cloudinarySecureUrl
  }
}
