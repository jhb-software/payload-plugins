import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'

type GetAdminThumbnail = (args: { doc: Record<string, unknown> }) => false | null | string

type GetAdminThumbnailFactory = (cloudName: string) => GetAdminThumbnail

/**
 * Factory function to create the adminThumbnail function with access to cloudName.
 * This generates thumbnail URLs directly from cloudinaryPublicId instead of relying on doc.url,
 * which may still be a relative path when Payload's thumbnailURL hook runs.
 */
export const getAdminThumbnailFactory: GetAdminThumbnailFactory = (cloudName) => {
  return ({ doc }) => {
    const cloudinaryPublicId = doc.cloudinaryPublicId
    const mimeType = doc.mimeType

    if (
      !cloudinaryPublicId ||
      !mimeType ||
      typeof cloudinaryPublicId !== 'string' ||
      typeof mimeType !== 'string'
    ) {
      return false
    }

    const transformOptions = 'w_300,h_300,c_fill,f_auto,q_auto,dpr_auto'

    // For videos, create an image thumbnail (webp format)
    if (mimeType.startsWith('video/')) {
      const publicIdWithoutExt = cloudinaryPublicId.replace(/\.[^/.]+$/, '')
      return generateCloudinaryUrl({
        cloudinaryPublicId: `${publicIdWithoutExt}.webp`,
        cloudName,
        mimeType: 'video/', // Keep as video for correct resource type
        transformOptions,
      })
    }

    return generateCloudinaryUrl({
      cloudinaryPublicId,
      cloudName,
      mimeType,
      transformOptions,
    })
  }
}
