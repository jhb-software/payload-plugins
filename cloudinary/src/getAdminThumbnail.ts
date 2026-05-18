import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'
import { generatePublicId } from './utilities/generatePublicId.js'

type GetAdminThumbnail = (args: { doc: Record<string, unknown> }) => false | null | string

type GetAdminThumbnailFactory = (args: {
  cloudName: string
  collectionPrefix: string
  folderSrc: string
}) => GetAdminThumbnail

// Derive the thumbnail URL from doc.filename + collection prefix + folder rather than
// reading doc.cloudinaryPublicId. The plugin owns the entire public_id namespace, so it
// can reconstruct it without depending on a value that the upload pipeline may not have
// persisted yet (e.g. during the upload-in-progress render).
export const getAdminThumbnailFactory: GetAdminThumbnailFactory = ({
  cloudName,
  collectionPrefix,
  folderSrc,
}) => {
  return ({ doc }) => {
    const filename = doc.filename
    const mimeType = doc.mimeType

    if (!filename || !mimeType || typeof filename !== 'string' || typeof mimeType !== 'string') {
      return null
    }

    const cloudinaryPublicId = `${folderSrc}${generatePublicId(collectionPrefix, filename)}`
    const transformOptions = 'w_300,h_300,c_fill,f_auto,q_auto,dpr_auto'

    if (mimeType.startsWith('video/')) {
      return generateCloudinaryUrl({
        cloudinaryPublicId: `${cloudinaryPublicId}.webp`,
        cloudName,
        mimeType: 'video/',
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
