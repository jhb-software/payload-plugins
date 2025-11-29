import type { CollectionConfig, CollectionSlug, PayloadRequest } from 'payload'

import type { SanitizedPageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { getPageConfig, isPageCollectionConfig } from '../utils/pageCollectionConfigHelpers.js'

/**
 * Finds all child documents that reference a given parent document.
 * Used by preventParentDeletion hook to prevent broken references.
 */
export async function childDocumentsOf(
  req: PayloadRequest,
  docId: number | string,
  collectionSlug: CollectionSlug,
  baseFilter?: PagesPluginConfig['baseFilter'],
): Promise<{ collection: CollectionSlug; id: number | string }[]> {
  const childReferences: { collection: CollectionSlug; id: number | string }[] = []

  const allCollections = req.payload.config.collections || []

  const pageCollections = allCollections.filter((col) =>
    isPageCollectionWithParent(col, collectionSlug),
  )

  for (const targetCollection of pageCollections) {
    const pageConfig = getPageConfig(targetCollection) as SanitizedPageCollectionConfigAttributes
    const parentFieldName = pageConfig.parent.name || 'parent'

    const baseFilterWhere = typeof baseFilter === 'function' ? baseFilter({ req }) : undefined

    try {
      const childDocuments = await req.payload.find({
        collection: targetCollection.slug,
        depth: 0,
        limit: 0,
        select: {},
        where: {
          and: [
            { [parentFieldName]: { equals: docId } },
            ...(baseFilterWhere ? [baseFilterWhere] : []),
          ],
        },
      })

      for (const doc of childDocuments.docs) {
        childReferences.push({
          id: doc.id,
          collection: targetCollection.slug,
        })
      }
    } catch (error) {
      console.warn(`Error checking collection ${targetCollection.slug} for child documents:`, error)
    }
  }

  return childReferences
}

/**
 * Check if a document has any child references
 */
export async function hasChildDocuments(
  req: PayloadRequest,
  docId: number | string,
  collectionSlug: CollectionSlug,
  baseFilter?: PagesPluginConfig['baseFilter'],
): Promise<boolean> {
  const children = await childDocumentsOf(req, docId, collectionSlug, baseFilter)
  return children.length > 0
}

/**
 * Checks if the collection is a page collection and if the parent collection field equals the expected collection slug.
 */
function isPageCollectionWithParent(
  collection: CollectionConfig,
  expectedParentCollectionSlug: CollectionSlug,
): boolean {
  if (!isPageCollectionConfig(collection)) {
    return false
  }

  const pageConfig = getPageConfig(collection)
  return pageConfig?.parent.collection === expectedParentCollectionSlug
}
