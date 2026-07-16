import type { SelectType, Where } from 'payload'

import { getSelectMode } from 'payload/shared'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import type { FindPageByPathArgs, PageDocument, PageDocumentResult } from './types.js'

import { isPageCollectionConfig } from '../utils/pageCollectionConfigHelpers.js'
import { ROOT_PAGE_SLUG } from '../utils/setRootPageVirtualFields.js'
import { buildPathCacheKey, type PathCacheEntry } from './pathCache.js'

/**
 * Finds the page document for a given path across all page collections.
 *
 * @experimental This API is experimental and may change or be removed in a future minor
 * release without a breaking-change bump. It needs more real-world testing before it is
 * marked stable.
 *
 * Because the `path` field is virtual, a path cannot be queried directly in the database.
 * Instead, the path is resolved in two ways:
 *
 * 1. **Cache lookup**: The KV store maps the path to the id of the document which resolved
 *    it last. The document is fetched by id and its current path is verified against the
 *    requested path, so a stale mapping (page renamed, moved, unpublished or deleted in the
 *    meantime) is never returned. Stale entries are deleted and fall through to the scan.
 * 2. **Scan**: All page collections are queried for documents whose slug matches the last
 *    path segment, and the computed path of each candidate is compared against the requested
 *    path. A successful resolution is written back to the cache.
 *
 * Only published documents are resolved unless `draft: true` is passed (a page that exists
 * only as a never-published draft is not resolved by a published lookup). Draft and published
 * lookups are cached under separate keys, so an unpublished change can never leak into a
 * published lookup (and vice versa). The cache only maps a path to a document id — the
 * document itself is re-fetched on every lookup, so a content change to a draft is always
 * reflected without invalidating the cached path.
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
  const payload = args.req?.payload ?? args.payload
  if (!payload) {
    throw new Error('Resolving a page by path requires either `payload` or `req`.')
  }

  const draft = args.draft ?? false
  const path = normalizePath(args.path)

  let candidates = payload.config.collections.filter((collection) =>
    isPageCollectionConfig(collection),
  ) as PageCollectionConfig[]

  if (candidates.length === 0) {
    throw new Error('The Payload config does not contain any page collections.')
  }

  // Determine the locale and the slug of the last path segment
  const localization = payload.config.localization
  const segments = path.split('/').slice(1)
  let slugSegments = segments
  let locale = args.locale

  if (localization) {
    if (segments[0] && localization.localeCodes.includes(segments[0])) {
      slugSegments = segments.slice(1)
      locale = locale ?? segments[0]
    }
    locale = locale ?? localization.defaultLocale
  }

  const slug = slugSegments.at(-1) ?? ROOT_PAGE_SLUG

  // Short paths usually belong to the root collection, so scanning it first saves queries.
  if (slugSegments.length <= 1) {
    candidates = [...candidates].sort(
      (a, b) => Number(b.page.isRootCollection ?? false) - Number(a.page.isRootCollection ?? false),
    )
  }

  const pluginConfig = candidates[0].custom?.pagesPluginConfig as PagesPluginConfig | undefined
  const cacheEnabled = args.cache ?? true

  // The plugin's `baseFilter` scopes every page query (e.g. to a tenant), so it must scope the
  // path lookup too — otherwise a lookup could resolve to a page of the wrong tenant. It is
  // evaluated from the request (e.g. the active tenant), so a `req` is required whenever a
  // `baseFilter` is configured.
  let baseFilter: undefined | Where
  if (pluginConfig?.baseFilter) {
    if (!args.req) {
      throw new Error(
        'Resolving a page by path requires `req` when the plugin is configured with a `baseFilter` (e.g. a multi-tenant setup), so the filter can be evaluated against the request.',
      )
    }
    baseFilter = pluginConfig.baseFilter({ req: args.req })
  }

  const cacheKey = buildPathCacheKey({ baseFilter, draft, locale, path, where: args.where })

  /**
   * Runs a cache maintenance write. Deferred via `args.waitUntil` when provided (the lookup
   * result never depends on these writes), otherwise awaited. Deferred failures are swallowed:
   * a lost write only means the next lookup falls back to the scan. Within a lookup, writes
   * are chained so a deferred stale-entry delete can never land after (and wipe) the
   * write-back that follows — and the chain recovers from a failed write, so a failed delete
   * does not drop the write-back.
   */
  let pendingCacheWrite: Promise<unknown> = Promise.resolve()
  const runCacheWrite = async (write: () => Promise<unknown>): Promise<void> => {
    pendingCacheWrite = pendingCacheWrite.then(write, write)
    if (args.waitUntil) {
      args.waitUntil(pendingCacheWrite.catch(() => {}))
    } else {
      await pendingCacheWrite
    }
  }

  /** Combines the given condition with the base filter, the caller's filter and the published-only constraint. */
  const buildWhere = (condition: Where, collection: PageCollectionConfig): Where => {
    const and: Where[] = [condition]
    if (baseFilter) {
      and.push(baseFilter)
    }
    if (args.where) {
      and.push(args.where)
    }
    // Without this constraint, a find with `draft: false` would still return
    // documents which only exist as a draft and were never published.
    if (!draft && hasDraftsEnabled(collection)) {
      and.push({ _status: { equals: 'published' } })
    }
    return { and }
  }

  const fetchDocument = async (
    collection: PageCollectionConfig,
    id: number | string,
  ): Promise<null | TDoc> => {
    const result = await payload.find({
      collection: collection.slug,
      depth: args.depth,
      draft,
      limit: 1,
      locale,
      overrideAccess: args.overrideAccess,
      pagination: false,
      populate: args.populate,
      req: args.req,
      select: ensurePathSelected(args.select),
      where: buildWhere({ id: { equals: id } }, collection),
    })

    return (result.docs[0] as TDoc | undefined) ?? null
  }

  if (cacheEnabled) {
    const entry = await payload.kv.get<PathCacheEntry>(cacheKey)
    const collection = entry
      ? candidates.find((candidate) => candidate.slug === entry.collection)
      : undefined

    if (entry && collection) {
      const doc = await fetchDocument(collection, entry.id)

      if (doc && doc.path === path) {
        args.onCacheResult?.({ cacheKey, path, status: 'hit' })
        return { collection: collection.slug, doc }
      }
    }

    if (entry) {
      // The entry is stale — either it no longer resolves (page renamed, moved, unpublished
      // or deleted) or it is unusable (collection removed, unparsed KV value). Delete it and
      // fall through to the scan.
      args.onCacheResult?.({ cacheKey, path, status: 'stale' })
      await runCacheWrite(() => payload.kv.delete(cacheKey))
    } else {
      args.onCacheResult?.({ cacheKey, path, status: 'miss' })
    }
  }

  for (const collection of candidates) {
    const result = await payload.find({
      collection: collection.slug,
      depth: 0,
      draft,
      locale,
      overrideAccess: args.overrideAccess,
      pagination: false,
      req: args.req,
      select: { slug: true, path: true },
      where: buildWhere({ slug: { equals: slug } }, collection),
    })

    // The slug only matches the last path segment, so verify the full path.
    const match = (result.docs as PageDocument[]).find((doc) => doc.path === path)
    if (!match) {
      continue
    }

    // Fetch the full document before caching, so a match that the richer fetch filters out
    // (e.g. via access control) never leaves behind an entry the next read would delete.
    const doc = await fetchDocument(collection, match.id)
    // Re-verify the path against the full fetch: the lean scan and the fetch are two separate
    // reads (unless a `req` transaction is shared), so the page could have moved in between.
    if (!doc || doc.path !== path) {
      return null
    }

    if (cacheEnabled) {
      await runCacheWrite(() =>
        payload.kv.set(cacheKey, {
          id: match.id,
          collection: collection.slug,
        } satisfies PathCacheEntry),
      )
    }

    return { collection: collection.slug, doc }
  }

  return null
}

/** Validates the leading slash and strips trailing slashes (except for the root path `/`). */
function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`The path "${path}" must start with a slash.`)
  }

  let normalized = path
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

/**
 * Ensures the virtual `path` field is part of the selection, as it is required to verify
 * that a resolved document actually matches the requested path.
 */
function ensurePathSelected(select: SelectType | undefined): SelectType | undefined {
  if (!select) {
    return undefined
  }

  if (getSelectMode(select) === 'include') {
    return { ...select, path: true }
  }

  // In exclude mode, remove a potential `path: false` so the path stays included
  const { path: _path, ...rest } = select
  return rest
}

/** Whether the collection has drafts (and therefore a `_status` field) enabled. */
function hasDraftsEnabled(collection: PageCollectionConfig): boolean {
  return typeof collection.versions === 'object' && Boolean(collection.versions.drafts)
}
