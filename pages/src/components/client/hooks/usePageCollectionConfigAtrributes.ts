'use client'

import type { PageCollectionConfigAttributes } from '../../../types/PageCollectionConfigAttributes.js'

import { asPageCollectionConfigOrThrow } from '../../../utils/pageCollectionConfigHelpers.js'
import { useCollectionConfig } from './useCollectionConfig.js'

/**
 * Returns the PageCollectionConfigAttributes for the collection of the document.
 */
export function usePageCollectionConfigAttributes(): PageCollectionConfigAttributes {
  const collection = useCollectionConfig()

  return asPageCollectionConfigOrThrow(collection).page
}
