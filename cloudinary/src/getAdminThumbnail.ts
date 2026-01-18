type GetAdminThumbnail = (args: { doc: Record<string, unknown> }) => false | null | string

export const getAdminThumbnail: GetAdminThumbnail = ({ doc }) => {
  if (
    !doc.url ||
    !doc.mimeType ||
    typeof doc.mimeType !== 'string' ||
    typeof doc.url !== 'string'
  ) {
    return false
  }

  const transformOptions = 'w_300,h_300,c_fill,f_auto,q_auto,dpr_auto'

  const newUrl = doc.url.replace('/upload', `/upload/${transformOptions}`)

  // As payload does not support videos as thumbnails, create an image thumbnail of the video:
  if (doc.mimeType.startsWith('video/')) {
    const videoThumbnailExtension = '.webp'
    const videoExtension = doc.url.split('/').pop()?.split('.').pop()
    const videoThumbnailUrl = newUrl.replace(`.${videoExtension}`, videoThumbnailExtension)

    return videoThumbnailUrl
  }

  return newUrl
}
