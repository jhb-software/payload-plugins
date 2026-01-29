export type GenerateCloudinaryUrlArgs = {
  cloudinaryPublicId: string
  cloudName: string
  mimeType?: string
  transformOptions?: string
}

/**
 * Generates a Cloudinary URL from the given parameters.
 * Shared logic used by both generateURL and getAdminThumbnail.
 */
export function generateCloudinaryUrl({
  cloudinaryPublicId,
  cloudName,
  mimeType,
  transformOptions,
}: GenerateCloudinaryUrlArgs): string {
  const baseUrl = `https://res.cloudinary.com/${cloudName}`

  // Determine resource type based on mimeType
  let resourceType: string
  if (mimeType?.startsWith('image/') || mimeType === 'application/pdf') {
    resourceType = 'image'
  } else if (mimeType?.startsWith('video/') || mimeType?.startsWith('audio/')) {
    resourceType = 'video'
  } else {
    resourceType = 'raw'
  }

  const transformPart = transformOptions ? `${transformOptions}/` : ''

  return `${baseUrl}/${resourceType}/upload/${transformPart}${cloudinaryPublicId}`
}
