import type { CollectionBeforeChangeHook } from 'payload'
import { ValidationError } from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

/**
 * A CollectionBeforeChangeHook that prevents circular parent references.
 *
 * It detects and rejects:
 * - Direct self-references (doc.parent = doc.id)
 * - Two-node cycles (A -> B -> A)
 * - Deep cycles (A -> B -> C -> A)
 */
export const preventCircularParentReference: CollectionBeforeChangeHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const pagesPluginConfig = collection.custom?.pagesPluginConfig as PagesPluginConfig
  const pageConfig = collection.custom?.pageConfig as { parent: { name: string; collection: string } }

  if (!pageConfig) return data

  const parentFieldName = pageConfig.parent.name
  const parentCollection = pageConfig.parent.collection

  // Only validate if the parent collection is the same as the current collection
  // (cross-collection parents cannot create cycles within this collection)
  if (parentCollection !== collection.slug) return data

  // Resolve the parent id from the incoming data
  const newParentValue = data[parentFieldName]
  const newParentId =
    newParentValue && typeof newParentValue === 'object' && 'id' in newParentValue
      ? newParentValue.id
      : newParentValue

  // No parent set – nothing to validate
  if (!newParentId) return data

  // Determine the id of the current document
  const currentId = operation === 'update' ? originalDoc?.id : undefined

  // Direct self-reference check
  if (currentId !== undefined && String(newParentId) === String(currentId)) {
    throw new ValidationError({
      errors: [{ message: 'A document cannot be its own parent', path: parentFieldName }],
    })
  }

  // Walk up the ancestor chain looking for cycles
  const visited = new Set<string>()
  if (currentId !== undefined) {
    visited.add(String(currentId))
  }

  let cursor: string | number | null | undefined = newParentId

  while (cursor) {
    const cursorStr = String(cursor)

    if (visited.has(cursorStr)) {
      throw new ValidationError({
        errors: [{ message: 'Circular parent reference detected', path: parentFieldName }],
      })
    }

    visited.add(cursorStr)

    const parent = await req.payload.findByID({
      collection: parentCollection as any,
      id: cursor as string,
      depth: 0,
      select: { [parentFieldName]: true },
      req,
    })

    const nextParentValue = (parent as Record<string, unknown>)?.[parentFieldName]
    cursor =
      nextParentValue && typeof nextParentValue === 'object' && 'id' in nextParentValue
        ? (nextParentValue as { id: string | number }).id
        : (nextParentValue as string | number | null | undefined)
  }

  return data
}
