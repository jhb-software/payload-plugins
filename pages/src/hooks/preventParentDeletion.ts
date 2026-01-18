import type { CollectionBeforeDeleteHook } from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { AdminPanelError } from '../utils/AdminPanelError.js'
import { childDocumentsOf } from '../utils/childDocumentsOf.js'

const ADAPTERS_REQUIRING_CUSTOM_LOGIC = [
  '@payloadcms/db-mongodb',
  '@payloadcms/db-sqlite',
  '@payloadcms/db-postgres',
]

export const preventParentDeletion: CollectionBeforeDeleteHook = async ({
  id,
  collection,
  req,
}) => {
  const databaseAdapter = req.payload.db.packageName || req.payload.db.name
  if (!ADAPTERS_REQUIRING_CUSTOM_LOGIC.includes(databaseAdapter)) {
    return
  }

  const pagesPluginConfig = collection.custom?.pagesPluginConfig as PagesPluginConfig

  const childDocuments = await childDocumentsOf(
    req,
    id,
    collection.slug,
    pagesPluginConfig?.baseFilter,
  )

  if (childDocuments.length > 0) {
    const childrenByCollection = childDocuments.reduce(
      (acc, child) => {
        if (!acc[child.collection]) {
          acc[child.collection] = []
        }
        acc[child.collection].push(child.id)
        return acc
      },
      {} as Record<string, (number | string)[]>,
    )

    const collectionMessages = Object.entries(childrenByCollection)
      .map(
        ([collectionSlug, ids]) =>
          `${ids.length} document(s) in the "${collectionSlug}" collection`,
      )
      .join(', ')

    const errorMessage = `Cannot delete this document because it is referenced as a parent by ${collectionMessages}. Please remove or reassign the child documents before deleting this parent document.`

    throw new AdminPanelError(errorMessage)
  }
}
