type GetAdminThumbnail = (args: { doc: Record<string, unknown> }) => false | null | string

export const getAdminThumbnail: GetAdminThumbnail = ({ doc }) => {
  if (
    !doc.cloudinarySecureUrl ||
    !doc.mimeType ||
    typeof doc.mimeType !== 'string' ||
    typeof doc.cloudinarySecureUrl !== 'string'
  ) {
    return false
  }

  const transformOptions = 'w_300,h_300,c_fill,f_auto,q_auto,dpr_auto'

  const newUrl = doc.cloudinarySecureUrl.replace('/upload', `/upload/${transformOptions}`)

  // As payload does not support videos as thumbnails, create an image thumbnail of the video:
  if (doc.mimeType.startsWith('video/')) {
    const videoThumbnailExtension = '.webp'
    const videoExtension = doc.cloudinarySecureUrl.split('/').pop()?.split('.').pop()
    const videoThumbnailUrl = newUrl.replace(`.${videoExtension}`, videoThumbnailExtension)

    return videoThumbnailUrl
  }

  return newUrl
}
