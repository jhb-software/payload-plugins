import type { SanitizedCollectionConfig, Where } from 'payload'

import { hasDraftsEnabled, hasLocalizeStatusEnabled } from 'payload/shared'

import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'

/**
 * The single definition of "this document's path resolves": published (on a collection with
 * drafts) and not trashed. `findPageByPath`, `listPagePaths` and `pathChanges` all read it from
 * here, so the three functions cannot disagree on which documents are live.
 *
 * With a localized `_status` (Payload's `localizeStatus`) liveness is answered per locale, so
 * a document published in `en` only resolves its English path.
 */

type Collection = PageCollectionConfig | SanitizedCollectionConfig

/**
 * The conditions a Local API query needs so it only returns live documents.
 *
 * Trashed documents are already excluded by the Local API's `trash: false` default, so only the
 * published-only constraint remains. Without it, a find with `draft: false` would still return
 * documents which only exist as a draft and were never published.
 *
 * With a localized `_status`, a specific locale is matched through its own `_status.<locale>`
 * key rather than through the request locale, and `'all'` matches a document published in any
 * locale — callers then narrow per locale via {@link isLiveRow}. This mirrors the query
 * Payload's own `replaceWithDraftIfAvailable` issues.
 */
export function livenessConditions(
  collection: Collection,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale?: 'all' | Locale,
  localeCodes?: Locale[],
): Where[] {
  if (!hasDraftsEnabled(collection)) {
    return []
  }

  if (!hasLocalizeStatusEnabled(collection)) {
    return [{ _status: { equals: 'published' } }]
  }

  if (locale && locale !== 'all') {
    return [{ [`_status.${locale}`]: { equals: 'published' } }]
  }

  return [
    { or: (localeCodes ?? []).map((code) => ({ [`_status.${code}`]: { equals: 'published' } })) },
  ]
}

/**
 * Row-level liveness for reads through `payload.db`, which see trashed rows and draft-only rows
 * the Local API would filter out.
 */
export function isLiveRow(
  row: Record<string, unknown>,
  collection: Collection,
  locale?: Locale,
): boolean {
  if (row.deletedAt) {
    return false
  }

  if (!hasDraftsEnabled(collection)) {
    return true
  }

  if (hasLocalizeStatusEnabled(collection)) {
    const status = row._status as null | Record<string, unknown> | undefined
    return Boolean(locale) && status?.[locale!] === 'published'
  }

  return row._status === 'published'
}

/**
 * Liveness keyed by locale (`''` on an unlocalized install), the shape `DocPaths.live` and the
 * descendant rows carry.
 */
export function livePerLocale(
  row: Record<string, unknown>,
  collection: Collection,
  locales: Locale[] | undefined,
): Record<string, boolean> {
  if (!locales) {
    return { '': isLiveRow(row, collection) }
  }

  return Object.fromEntries(locales.map((locale) => [locale, isLiveRow(row, collection, locale)]))
}
