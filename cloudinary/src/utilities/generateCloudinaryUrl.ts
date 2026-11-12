import { v2 as cloudinary } from 'cloudinary'

import type { DeliveryType } from '../types.js'

export type GenerateCloudinaryUrlArgs = {
  /** Signs `authenticated` URLs. Passed explicitly since plugin instances share the SDK config. */
  apiSecret?: string
  cloudinaryPublicId: string
  cloudName: string
  deliveryType?: DeliveryType
  mimeType?: string
  transformOptions?: string
}

/**
 * Generates a Cloudinary URL from the given parameters.
 * Shared logic used by both generateURL and getAdminThumbnail.
 */
export function generateCloudinaryUrl({
  apiSecret,
  cloudinaryPublicId,
  cloudName,
  deliveryType = 'upload',
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

  // The signature covers the transformation too, so the SDK builds the whole URL.
  if (deliveryType === 'authenticated') {
    return cloudinary.url(cloudinaryPublicId, {
      type: 'authenticated',
      api_secret: apiSecret,
      cloud_name: cloudName,
      raw_transformation: transformOptions,
      resource_type: resourceType,
      secure: true,
      sign_url: true,
      urlAnalytics: false,
    })
  }

  const transformPart = transformOptions ? `${transformOptions}/` : ''

  return `${baseUrl}/${resourceType}/upload/${transformPart}${cloudinaryPublicId}`
}
