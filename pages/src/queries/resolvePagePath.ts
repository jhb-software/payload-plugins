import type { ResolvedPagePath, ResolvePagePathArgs } from './types.js'

import { queryPageByPath } from './queryPageByPath.js'

/**
 * Resolves a path to the collection and id of the page it belongs to, without fetching
 * the full document.
 *
 * Useful when only the identity of the page is needed (e.g. to build a lightweight
 * page-props endpoint) — fetch the full document with `payload.findByID` when required,
 * or use `findPageByPath` to do both in one call.
 *
 * Uses the same KV path cache and verification as `findPageByPath`.
 */
export async function resolvePagePath(args: ResolvePagePathArgs): Promise<null | ResolvedPagePath> {
  const result = await queryPageByPath(args, { depth: 0, select: { slug: true, path: true } })

  if (!result) {
    return null
  }

  return {
    id: result.doc.id,
    collection: result.collection,
    path: result.doc.path as string,
  }
}
