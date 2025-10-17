import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { BasePayload } from 'payload'
import { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

/**
 * Get the page config attributes for a collection.
 *
 * This is useful inside server components, where the `usePageCollectionConfigAttributes` hook is not available.
 */
export function getPageCollectionConfigAttributes({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: BasePayload
}): PageCollectionConfigAttributes {
  const collection = payload.collections[collectionSlug]
  const pageConfig = asPageCollectionConfigOrThrow(collection.config)

  return pageConfig.page
}
