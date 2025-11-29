import type { BasePayload } from 'payload'

import type { SanitizedPageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

import { getPageConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'

/**
 * Get the sanitized page config attributes for a collection.
 *
 * Only available in server components.
 */
export function getPageCollectionConfigAttributes({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: BasePayload
}): SanitizedPageCollectionConfigAttributes {
  const collection = payload.collections[collectionSlug]
  return getPageConfigOrThrow(collection.config)
}
