import type { CollectionSlug } from 'payload'

/** Document ids are numbers on SQL adapters and strings on MongoDB. */
type DocumentID = number | string

/** The parent configuration this module reads, in both its incoming and its processed form. */
type WithParentCollection = {
  parent: { collection: CollectionSlug | CollectionSlug[] }
}

/** A resolved parent reference: the collection the parent lives in and its id. */
export type ParentRef = {
  collection: CollectionSlug
  id: DocumentID
}

/** The collections a document of this collection may be parented to. */
export function parentCollections(pageConfig: WithParentCollection): CollectionSlug[] {
  const { collection } = pageConfig.parent
  return Array.isArray(collection) ? collection : [collection]
}

/**
 * Whether the parent field stores `{ relationTo, value }` rather than a bare id.
 *
 * Payload treats any array `relationTo` as polymorphic, including a single-element one, so this
 * follows the declared shape rather than the number of collections.
 */
export function hasPolymorphicParent(pageConfig: WithParentCollection): boolean {
  return Array.isArray(pageConfig.parent.collection)
}

/**
 * Normalizes a stored parent value to the collection and id it points at.
 *
 * Handles a bare id, a populated document, `{ relationTo, value: id }` and
 * `{ relationTo, value: doc }`. On a monomorphic config the collection is the configured one;
 * on a polymorphic config it comes from the value, so a bare id resolves to null — its
 * collection is not knowable.
 */
export function resolveParentRef(
  value: unknown,
  pageConfig: WithParentCollection,
): null | ParentRef {
  if (value === null || value === undefined) {
    return null
  }

  if (isPolymorphicValue(value)) {
    const id = extractID(value.value)
    return id === null ? null : { id, collection: value.relationTo }
  }

  const id = extractID(value)
  if (id === null) {
    return null
  }

  const { collection } = pageConfig.parent
  return Array.isArray(collection) ? null : { id, collection }
}

function isPolymorphicValue(
  value: unknown,
): value is { relationTo: CollectionSlug; value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'relationTo' in value &&
    typeof value.relationTo === 'string'
  )
}

/** Extracts a plain id from a raw relationship value (an id, or a populated document). */
export function extractID(value: unknown): DocumentID | null {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const id = value.id
    if (typeof id === 'number' || typeof id === 'string') {
      return id
    }
  }
  return null
}
