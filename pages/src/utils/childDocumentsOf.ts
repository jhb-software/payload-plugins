import { PayloadRequest, CollectionSlug } from 'payload'
import type { CollectionConfig } from 'payload'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import { isPageCollectionConfig } from '../utils/pageCollectionConfigHelpers.js'

/**
 * Finds all child documents that reference a given parent document.
 * Used by preventParentDeletion hook to prevent broken references.
 */
export async function childDocumentsOf(
  req: PayloadRequest,
  docId: string | number,
  collectionSlug: CollectionSlug,
  baseFilter?: PagesPluginConfig['baseFilter'],
): Promise<{ id: string | number; collection: CollectionSlug }[]> {
  const childReferences: { id: string | number; collection: CollectionSlug }[] = []

  const allCollections = req.payload.config.collections || []

  const pageCollections = allCollections.filter((col) =>
    isPageCollectionWithParent(col, collectionSlug),
  )

  for (const targetCollection of pageCollections) {
    const parentFieldName = targetCollection.page.parent.name || 'parent'

    const baseFilterWhere = typeof baseFilter === 'function' ? baseFilter({ req }) : undefined

    try {
      const childDocuments = await req.payload.find({
        collection: targetCollection.slug,
        where: {
          and: [
            { [parentFieldName]: { equals: docId } },
            ...(baseFilterWhere ? [baseFilterWhere] : []),
          ],
        },
        depth: 0,
        select: {},
        limit: 0,
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
  docId: string | number,
  collectionSlug: CollectionSlug,
  baseFilter?: PagesPluginConfig['baseFilter'],
): Promise<boolean> {
  const children = await childDocumentsOf(req, docId, collectionSlug, baseFilter)
  return children.length > 0
}

/**
 * Checks if the specified `CollectionConfig` is a `PageCollectionConfig` and if the parent collection field equals to the expected collection slug.
 */
function isPageCollectionWithParent(
  collection: CollectionConfig,
  expectedParentCollectionSlug: CollectionSlug,
): collection is PageCollectionConfig {
  const pageConfig = isPageCollectionConfig(collection)
  if (!pageConfig) return false

  return collection.page.parent.collection === expectedParentCollectionSlug
}
