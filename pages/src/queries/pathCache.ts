import type { Payload, Where } from 'payload'

import type { Locale } from '../types/Locale.js'

/** Prefix of all KV keys written by the path cache. */
export const PATH_CACHE_KEY_PREFIX = 'payload-pages:path:v1'

/** A cached path→page mapping stored in Payload's KV store. */
export type PathCacheEntry = {
  collection: string
  id: number | string
}

/** Builds the KV key for a path lookup. */
export function buildPathCacheKey({
  baseFilter,
  draft,
  locale,
  path,
  where,
}: {
  baseFilter: undefined | Where
  draft: boolean
  locale: Locale | undefined
  path: string
  where: undefined | Where
}): string {
  // The `baseFilter` (e.g. tenant scoping) and the caller's `where` scope the lookup, so they
  // must scope the cache entry as well. A hash keeps the key short; a hash collision cannot
  // yield a wrong result because every cached id is re-fetched with the actual filters applied.
  const scopeHash = baseFilter || where ? fnv1aHash(JSON.stringify({ baseFilter, where })) : '-'

  // Draft and published lookups can resolve the same path to different documents, so they
  // must never share a cache slot.
  const status = draft ? 'draft' : 'published'

  return `${PATH_CACHE_KEY_PREFIX}:${status}:${locale ?? '-'}:${scopeHash}:${path}`
}

/**
 * Deletes all path cache entries from Payload's KV store.
 *
 * Useful after bulk operations which change many paths at once (e.g. imports or
 * migrations). Individual stale entries are detected and refreshed automatically,
 * so calling this is never required for correctness.
 */
export async function clearPathCache(payload: Payload): Promise<void> {
  const keys = await payload.kv.keys()

  await Promise.all(
    keys
      .filter((key) => key.startsWith(`${PATH_CACHE_KEY_PREFIX}:`))
      .map((key) => payload.kv.delete(key)),
  )
}

/** Returns the FNV-1a hash of the input as a hex string. */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
