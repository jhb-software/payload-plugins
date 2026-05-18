import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'
import { generatePublicId } from './utilities/generatePublicId.js'

export const getGenerateUrl = ({
  cloudName,
  collectionPrefix,
  folderSrc,
}: {
  cloudName: string
  collectionPrefix: string
  folderSrc: string
}): GenerateURL => {
  return ({ data, filename }) => {
    const mimeType =
      data && 'mimeType' in data && typeof data.mimeType === 'string' ? data.mimeType : undefined

    if (!filename) {
      return undefined as unknown as string
    }

    return generateCloudinaryUrl({
      cloudinaryPublicId: `${folderSrc}${generatePublicId(collectionPrefix, filename)}`,
      cloudName,
      mimeType,
    })
  }
}
