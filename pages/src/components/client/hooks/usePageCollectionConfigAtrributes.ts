'use client'

import { PageCollectionConfigAttributes } from '../../../types/PageCollectionConfigAttributes.js'
import { useCollectionConfig } from './useCollectionConfig.js'
import { asPageCollectionConfigOrThrow } from '../../../utils/pageCollectionConfigHelpers.js'

/**
 * Returns the PageCollectionConfigAttributes for the collection of the document.
 */
export function usePageCollectionConfigAttributes(): PageCollectionConfigAttributes {
  const collection = useCollectionConfig()

  return asPageCollectionConfigOrThrow(collection).page
}
