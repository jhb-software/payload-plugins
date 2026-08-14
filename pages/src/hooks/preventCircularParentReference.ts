import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import type { ParentRef } from '../utils/parentRef.js'

import { pageAttributesOf } from '../utils/pageCollectionConfigHelpers.js'
import {
  parentRefKey,
  resolveParentRef,
  tryResolveParentRef,
  UnresolvableParentRefError,
} from '../utils/parentRef.js'

/**
 * A CollectionBeforeChangeHook that prevents circular parent references.
 *
 * It detects and rejects:
 * - Direct self-references (doc.parent = doc.id)
 * - Two-node cycles (A -> B -> A)
 * - Deep cycles (A -> B -> C -> A)
 *
 * The walk crosses collections. With a polymorphic `parent.collection` a collection can be
 * parented both to itself and to another page collection, which makes a cycle such as
 * `topics/1 -> pages/2 -> topics/3 -> topics/1` reachable — one that never revisits the same
 * collection twice in a row, and which would otherwise recurse until the request dies while
 * resolving breadcrumbs.
 */
export const preventCircularParentReference: CollectionBeforeChangeHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const pageConfig = pageAttributesOf(collection)

  if (!pageConfig) {
    return data
  }

  const parentFieldName = pageConfig.parent.name

  let newParentRef: null | ParentRef

  try {
    newParentRef = resolveParentRef(data[parentFieldName], pageConfig)
  } catch (error) {
    if (!(error instanceof UnresolvableParentRefError)) {
      throw error
    }

    // Payload skips field validation on draft saves, so without this the value would be stored
    // and only surface later as a document that has silently fallen out of the page tree.
    throw new ValidationError({
      errors: [{ message: error.message, path: parentFieldName }],
    })
  }

  // No parent set – nothing to validate
  if (!newParentRef) {
    return data
  }

  // Determine the ref of the current document
  const currentRef: null | ParentRef =
    operation === 'update' && originalDoc?.id !== undefined
      ? { id: originalDoc.id, collection: collection.slug }
      : null

  // On updates, skip the ancestor walk if the parent hasn't changed
  if (operation === 'update' && originalDoc) {
    // An unresolvable stored value must not block a write which replaces it, so it counts as a
    // changed parent rather than failing here.
    const originalParentRef = tryResolveParentRef(originalDoc[parentFieldName], pageConfig)

    if (originalParentRef && parentRefKey(originalParentRef) === parentRefKey(newParentRef)) {
      return data
    }
  }

  // Direct self-reference check
  if (currentRef && parentRefKey(currentRef) === parentRefKey(newParentRef)) {
    throw new ValidationError({
      errors: [{ message: 'A document cannot be its own parent', path: parentFieldName }],
    })
  }

  // Walk up the ancestor chain looking for cycles. `visited` is kept ordered so the error can
  // name the chain that closes the loop.
  const visited: string[] = currentRef ? [parentRefKey(currentRef)] : []

  let cursor: null | ParentRef = newParentRef

  while (cursor) {
    const key = parentRefKey(cursor)

    if (visited.includes(key)) {
      throw new ValidationError({
        errors: [
          {
            message: `Circular parent reference detected: ${[...visited, key].join(' -> ')}`,
            path: parentFieldName,
          },
        ],
      })
    }

    visited.push(key)

    // Each hop names its parent field independently, so the config is read per collection
    // rather than reusing the one of the document being saved.
    const hopConfig = pageAttributesOf(req.payload.collections[cursor.collection]?.config)

    // A non-page collection has no parent to follow, so the chain ends here.
    if (!hopConfig) {
      return data
    }

    const hopParentField = hopConfig.parent.name

    const ancestor = (await req.payload.findByID({
      id: cursor.id,
      collection: cursor.collection,
      depth: 0,
      // A missing ancestor ends the walk instead of failing the save.
      disableErrors: true,
      draft: true,
      // Whether a cycle exists is a structural invariant, not a user read: an editor allowed to
      // write this collection but not to read an ancestor collection must not hit an access
      // error on save.
      overrideAccess: true,
      req,
      select: { [hopParentField]: true },
    })) as null | Record<string, unknown>

    // An ancestor carrying an unresolvable parent value ends the walk: the chain cannot be
    // followed any further, and that ancestor's own writes are refused above.
    cursor = ancestor ? tryResolveParentRef(ancestor[hopParentField], hopConfig) : null
  }

  return data
}
