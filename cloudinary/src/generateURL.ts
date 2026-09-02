import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import type { CloudinaryStorageOptions } from './types.js'
import type { PayloadRef } from './utilities/payloadRef.js'

import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'

export const getGenerateUrl = ({
  options,
  payloadRef,
}: {
  options: CloudinaryStorageOptions
  payloadRef: PayloadRef
}): GenerateURL => {
  return ({ data }) => {
    const mimeType = (
      'mimeType' in data && typeof data.mimeType === 'string' ? data.mimeType : undefined
    ) as string | undefined

    if (!mimeType) {
      payloadRef.current?.logger.warn(
        { data },
        'MimeType field is missing in data passed to the generateURL function. This can happen if a find query contains select without mimeType. Falling back to auto/upload.',
      )
    }

    const cloudinaryPublicId =
      'cloudinaryPublicId' in data && typeof data.cloudinaryPublicId === 'string'
        ? data.cloudinaryPublicId
        : undefined
    if (!cloudinaryPublicId) {
      // since Payload 3.7X this is called during upload, therefore its not possible to throw an error here, otherwise the upload fails
      return undefined as unknown as string
    }

    return generateCloudinaryUrl({
      cloudinaryPublicId,
      cloudName: options.cloudName,
      mimeType,
    })
  }
}
