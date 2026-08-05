import type { CollectionAfterReadHook, FieldHook } from 'payload'

/**
 * Counts how often user-defined `afterRead` hooks run, keyed by document id.
 *
 * Wired into the `pages` collection so tests can observe how many times a user's own hooks
 * are executed for documents the caller never asked for (e.g. ancestors walked while the
 * plugin generates the virtual `path` / `breadcrumbs` fields).
 */

type CountsById = Map<number | string, number>

const collectionAfterReadCounts: CountsById = new Map()
const fieldAfterReadCounts: Map<string, CountsById> = new Map()

const increment = (counts: CountsById, id: number | string | undefined) => {
  if (id === undefined || id === null) {
    return
  }
  counts.set(id, (counts.get(id) ?? 0) + 1)
}

/** Resets all recorded hook execution counts. Call before the operation under test. */
export const resetHookExecutionCounts = () => {
  collectionAfterReadCounts.clear()
  fieldAfterReadCounts.clear()
}

/** Returns how often the collection `afterRead` hook ran for the given document. */
export const collectionAfterReadCount = (id: number | string): number =>
  collectionAfterReadCounts.get(id) ?? 0

/** Returns how often the `afterRead` hook of the given field ran for the given document. */
export const fieldAfterReadCount = (fieldName: string, id: number | string): number =>
  fieldAfterReadCounts.get(fieldName)?.get(id) ?? 0

/**
 * A collection `afterRead` hook standing in for any user-defined `afterRead` hook
 * (signing image URLs, calling an external API, computing derived data, ...).
 */
export const countCollectionAfterRead: CollectionAfterReadHook = ({ doc }) => {
  increment(collectionAfterReadCounts, doc?.id as number | string | undefined)
  return doc
}

/** Builds a field-level `afterRead` hook that counts its executions per document. */
export const countFieldAfterRead =
  (fieldName: string): FieldHook =>
  ({ data, originalDoc, siblingData, value }) => {
    const id = (siblingData?.id ?? data?.id ?? originalDoc?.id) as number | string | undefined

    let counts = fieldAfterReadCounts.get(fieldName)
    if (!counts) {
      counts = new Map()
      fieldAfterReadCounts.set(fieldName, counts)
    }
    increment(counts, id)

    return value
  }
