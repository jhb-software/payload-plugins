import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  DefaultDocumentIDType,
  PayloadRequest,
  SanitizedCollectionConfig,
} from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { AdminPanelError } from '../utils/AdminPanelError.js'
import { childDocumentsOf } from '../utils/childDocumentsOf.js'

/** Database adapters the permanent-delete guard has been verified against. */
const ADAPTERS_REQUIRING_CUSTOM_LOGIC = [
  '@payloadcms/db-mongodb',
  '@payloadcms/db-sqlite',
  '@payloadcms/db-postgres',
]

/**
 * Context key which disables both parent guards for the request it is set on.
 *
 * A caller which removes a whole subtree in one operation cannot orphan anything — every child is
 * going too — so the guards' premise does not hold and ordering the deletes leaf-first only adds
 * fragility. Pass it through the `context` argument of the delete or update call:
 *
 * ```ts
 * await payload.delete({
 *   collection: 'pages',
 *   id: subtreeRootId,
 *   context: { [SKIP_PARENT_GUARD_CONTEXT_KEY]: true },
 * })
 * ```
 *
 * The flag lives on the request, so every delete and trash operation sharing that request skips
 * the guards, not only the subtree that motivated it. The admin panel never sets it.
 */
export const SKIP_PARENT_GUARD_CONTEXT_KEY = 'pagesPluginSkipParentGuard'

/** Throws when the given document is still referenced as a parent by other documents. */
async function assertNoChildDocuments({
  id,
  collection,
  req,
}: {
  collection: SanitizedCollectionConfig
  id: DefaultDocumentIDType
  req: PayloadRequest
}) {
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
      {} as Record<string, DefaultDocumentIDType[]>,
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

/**
 * Refuses a permanent delete of a document which is still referenced as a parent.
 *
 * Runs only on the adapters listed above; on any other adapter the delete is left to whatever
 * referential integrity the database enforces itself.
 */
export const preventParentDeletion: CollectionBeforeDeleteHook = async ({
  id,
  collection,
  req,
}) => {
  if (req.context?.[SKIP_PARENT_GUARD_CONTEXT_KEY] === true) {
    return
  }

  const databaseAdapter = req.payload.db.packageName || req.payload.db.name
  if (!ADAPTERS_REQUIRING_CUSTOM_LOGIC.includes(databaseAdapter)) {
    return
  }

  await assertNoChildDocuments({ id, collection, req })
}

/**
 * Refuses moving a document which is still referenced as a parent to the trash.
 *
 * Payload soft-deletes through `update`, so a trash operation never reaches `beforeDelete`.
 * Without this hook the guard would not run for the delete path an editor actually uses on a
 * collection with `trash: true`. Restoring a document is never blocked.
 *
 * Runs on every adapter, unlike the permanent-delete guard: a soft delete writes `deletedAt` through
 * an update, which no database constrains, so there is no referential integrity to fall back on.
 */
export const preventParentTrashing: CollectionBeforeChangeHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  if (req.context?.[SKIP_PARENT_GUARD_CONTEXT_KEY] === true) {
    return data
  }

  const isBeingTrashed = Boolean(data.deletedAt) && !originalDoc?.deletedAt

  if (!isBeingTrashed || originalDoc?.id == null) {
    return data
  }

  await assertNoChildDocuments({ id: originalDoc.id, collection, req })

  return data
}
