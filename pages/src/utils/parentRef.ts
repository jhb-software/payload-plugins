import type { CollectionSlug, DefaultDocumentIDType } from 'payload'

/** The parent configuration this module reads, in both its incoming and its processed form. */
type WithParentCollection = {
  parent: { collection: CollectionSlug | CollectionSlug[] }
}

/** A resolved parent reference: the collection the parent lives in and its id. */
export type ParentRef = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
}

/**
 * Thrown when a parent value is set but does not say which collection it points at.
 *
 * The only way to hit this is a bare id stored in a polymorphic parent field, which is what a
 * collection switched from a single slug to a list looks like before its rows are migrated.
 */
export class UnresolvableParentRefError extends Error {}

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
 * on a polymorphic config it comes from the value.
 *
 * Returns null when no parent is set. A bare id on a polymorphic config throws
 * `UnresolvableParentRefError` instead: its collection is not knowable, and reporting it as "no
 * parent" would drop the document out of the page tree without anyone noticing. Callers which
 * must not fail on such a value use `tryResolveParentRef`.
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

  if (Array.isArray(collection)) {
    throw new UnresolvableParentRefError(
      `[Pages Plugin] The parent value "${String(id)}" does not name the collection it points at. A parent which may live in any of ${collection.map((slug) => `"${slug}"`).join(', ')} must be stored as \`{ relationTo, value }\`, not as a bare id.`,
    )
  }

  return { id, collection }
}

/**
 * Like `resolveParentRef`, but reports an unresolvable value as "no parent" instead of throwing.
 *
 * For the paths where a malformed stored value must not take the whole operation down — the
 * admin panel's path preview, and the ancestors visited while checking for cycles.
 */
export function tryResolveParentRef(
  value: unknown,
  pageConfig: WithParentCollection,
): null | ParentRef {
  try {
    return resolveParentRef(value, pageConfig)
  } catch (error) {
    if (error instanceof UnresolvableParentRefError) {
      return null
    }
    throw error
  }
}

/** Identifies a document across collections, used wherever visited parents are compared. */
export function parentRefKey(ref: ParentRef): string {
  return `${ref.collection}:${String(ref.id)}`
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
export function extractID(value: unknown): DefaultDocumentIDType | null {
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
