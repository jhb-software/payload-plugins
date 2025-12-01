'use client'

import type { ClientCollectionConfig } from 'payload'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'

/**
 * Returns the collection config for the collection of the document.
 */
export function useCollectionConfig(): ClientCollectionConfig {
  const { collectionSlug } = useDocumentInfo()
  const {
    config: { collections },
  } = useConfig()

  const collection = collections.find((c) => c.slug === collectionSlug)!

  return collection
}
