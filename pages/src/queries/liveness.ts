import type { SanitizedCollectionConfig, Where } from 'payload'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'

/**
 * The single definition of "this document's path resolves": published (on a collection with
 * drafts) and not trashed. `findPageByPath`, `listPagePaths` and `pathChanges` all read it from
 * here, so the three functions cannot disagree on which documents are live.
 */

/** Whether the collection stores drafts (and therefore a `_status` field) in its versions table. */
export function hasDraftsEnabled(
  collection: PageCollectionConfig | SanitizedCollectionConfig,
): boolean {
  return typeof collection.versions === 'object' && Boolean(collection.versions.drafts)
}

/**
 * The conditions a Local API query needs so it only returns live documents.
 *
 * Trashed documents are already excluded by the Local API's `trash: false` default, so only the
 * published-only constraint remains. Without it, a find with `draft: false` would still return
 * documents which only exist as a draft and were never published.
 */
export function livenessConditions(
  collection: PageCollectionConfig | SanitizedCollectionConfig,
): Where[] {
  return hasDraftsEnabled(collection) ? [{ _status: { equals: 'published' } }] : []
}

/**
 * Row-level liveness for reads through `payload.db`, which see trashed rows and draft-only rows
 * the Local API would filter out.
 */
export function isLiveRow(
  row: Record<string, unknown>,
  collection: PageCollectionConfig | SanitizedCollectionConfig,
): boolean {
  if (row.deletedAt) {
    return false
  }
  return !hasDraftsEnabled(collection) || row._status === 'published'
}
