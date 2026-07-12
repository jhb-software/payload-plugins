import type { FindPageByPathArgs, PageDocument, PageDocumentResult } from './types.js'

import { queryPageByPath } from './queryPageByPath.js'

/**
 * Finds the page document for a given path across all page collections.
 *
 * Uses the KV path cache (see the `pathCache` plugin config option) to avoid scanning
 * the page collections on repeated lookups. Cached mappings are verified against the
 * requested path on every read, so a stale mapping is never returned.
 *
 * Only published documents are resolved unless `draft: true` is passed. Draft and published
 * lookups are cached under separate keys and never leak into each other.
 *
 * @example
 * ```ts
 * const result = await findPageByPath({ payload, path: '/de/blog/my-post' })
 * if (result) {
 *   console.log(result.collection, result.doc)
 * }
 * ```
 */
export async function findPageByPath<TDoc extends PageDocument = PageDocument>(
  args: FindPageByPathArgs,
): Promise<null | PageDocumentResult<TDoc>> {
  const { depth, populate, select, ...queryArgs } = args

  return await queryPageByPath<TDoc>(queryArgs, { depth, populate, select })
}
