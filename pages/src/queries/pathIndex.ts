import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionSlug,
  DefaultDocumentIDType,
  PayloadRequest,
  Where,
} from 'payload'

import { hasDraftsEnabled } from 'payload/shared'

import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import type { DocPaths } from '../utils/computeDocPaths.js'

import {
  isVersionOnlyWrite,
  type PathCapture,
  pathCaptures,
} from '../hooks/capturePreviousPaths.js'
import { computeDocPaths, noDocPaths } from '../utils/computeDocPaths.js'
import { assembleDescendantPaths, loadDescendants } from '../utils/loadDescendants.js'
import { localeCodesOf } from '../utils/localeFromRequest.js'
import {
  asPageCollectionConfigOrThrow,
  isPageCollectionConfig,
  pagesPluginConfigOf,
} from '../utils/pageCollectionConfigHelpers.js'
import { isLiveRow, livenessConditions } from './liveness.js'

/** One live path of one document, as enumerated by {@link listPagePaths}. */
export type PagePathEntry = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  /** Present on a localized install only: the locale the path belongs to. */
  locale?: string
  path: string
  /** The value of the collection's `breadcrumbs.labelField`, or null when it is unset. */
  title: null | string
  updatedAt: string
}

/** Arguments for {@link listPagePaths}. */
export type ListPagePathsArgs = {
  /**
   * Pass `false` to enumerate without the plugin's `baseFilter` — e.g. a cache warmer or a
   * multi-tenant sweep that scopes explicitly through `where` instead of through the request.
   * When omitted, the plugin's `baseFilter` is evaluated against `req` and applied.
   */
  baseFilter?: false

  /**
   * The page collections to enumerate. Defaults to every registered page collection, so a
   * newly added page collection appears without a code change.
   */
  collections?: CollectionSlug[]

  /**
   * Whether to enumerate the latest versions instead of the published ones, mirroring
   * `findPageByPath`.
   *
   * @default false
   */
  draft?: boolean

  /** Narrows a localized install to one locale. Ignored on an unlocalized install. */
  locale?: Locale

  /**
   * Whether to skip Payload's access control, mirroring `payload.find`. Pass `false` to
   * enforce each collection's read access for `req.user`.
   *
   * @default true
   */
  overrideAccess?: boolean

  /**
   * The Payload request. Queries run on its transaction and user, and the plugin's
   * `baseFilter` (e.g. the active tenant) is evaluated against it.
   */
  req: PayloadRequest

  /**
   * An additional filter, merged per collection with `and` — it can narrow the enumeration
   * but never widen it past the plugin's own conditions. A plain `Where` applies to every
   * enumerated collection, so its fields must be queryable on all of them; the function form
   * is called once per collection and returns a filter for it, or `undefined` to leave it
   * unfiltered — for fields that exist on only some collections. On a localized install the
   * default enumeration queries all locales at once, where Payload cannot filter on localized
   * fields — filter on unlocalized fields, or pass `locale` to filter on localized ones.
   */
  where?: ((collection: { slug: CollectionSlug }) => undefined | Where) | Where
}

/**
 * Enumerates every live path across the plugin's page collections: published, not trashed, and
 * scoped by the plugin's `baseFilter`. On a localized install the result carries one entry per
 * (document, locale); a locale whose slug is unset yields no entry, matching the path
 * computation.
 *
 * A trusted server-side primitive, like `payload.find` itself: the plugin's `baseFilter` and
 * skipped access control are defaults, not restrictions — infrastructure code (a cache warmer,
 * a multi-tenant sitemap sweep, build-time enumeration) lifts them via `baseFilter: false` and
 * scopes explicitly through `where`, or opts into enforcement via `overrideAccess: false`.
 *
 * @experimental This API is experimental and may change or be removed in a future minor
 * release without a breaking-change bump. It needs more real-world testing before it is
 * marked stable.
 *
 * Returns data, not XML — sitemap, robots.txt and llms.txt serialization stay with the caller,
 * as do indexability rules (pass a noindex filter through `where` on the sitemap call only).
 *
 * @example
 * ```ts
 * const entries = await listPagePaths({ req })
 * const sitemap = entries.map(({ path, updatedAt }) => ({ loc: `${origin}${path}`, lastmod: updatedAt }))
 * ```
 */
export async function listPagePaths(args: ListPagePathsArgs): Promise<PagePathEntry[]> {
  const { req } = args
  const { payload } = req

  const pageCollections = payload.config.collections.filter((collection) =>
    isPageCollectionConfig(collection),
  ) as PageCollectionConfig[]

  if (pageCollections.length === 0) {
    throw new Error('The Payload config does not contain any page collections.')
  }

  const collections = args.collections
    ? args.collections.map((slug) => {
        const collection = pageCollections.find((candidate) => candidate.slug === slug)
        if (!collection) {
          throw new Error(`The collection "${slug}" is not a page collection.`)
        }
        return collection
      })
    : pageCollections

  const draft = args.draft ?? false
  const localeCodes = localeCodesOf(payload)
  const locale = localeCodes ? (args.locale ?? 'all') : undefined

  // Any page collection's copy of the shared plugin config — including its baseFilter — speaks
  // for all of them. This breaks if the plugin ever supports multiple instances with different
  // configs in one Payload config.
  const pluginConfig = pagesPluginConfigOf(collections[0])
  const baseFilter = args.baseFilter === false ? undefined : pluginConfig?.baseFilter?.({ req })

  const enumerateCollection = async (
    collection: PageCollectionConfig,
  ): Promise<PagePathEntry[]> => {
    const labelField = collection.page.breadcrumbs.labelField

    const and: Where[] = draft ? [] : livenessConditions({ collection, locale, localeCodes })
    if (baseFilter) {
      and.push(baseFilter)
    }
    const where =
      typeof args.where === 'function' ? args.where({ slug: collection.slug }) : args.where
    if (where) {
      and.push(where)
    }

    const { docs } = await payload.find({
      collection: collection.slug,
      depth: 0,
      draft,
      limit: 0,
      locale,
      overrideAccess: args.overrideAccess,
      pagination: false,
      req,
      select: {
        [labelField]: true,
        path: true,
        updatedAt: true,
        ...(hasDraftsEnabled(collection) ? { _status: true } : {}),
      },
      where: and.length > 0 ? { and } : undefined,
    })

    const entries: PagePathEntry[] = []
    for (const doc of docs as Record<string, unknown>[]) {
      // key the per-document paths by locale; `''` stands for an unlocalized install
      const paths: Record<string, unknown> =
        locale === 'all'
          ? ((doc.path as Record<string, unknown> | undefined) ?? {})
          : { [locale ?? '']: doc.path }

      for (const [pathLocale, path] of Object.entries(paths)) {
        if (typeof path !== 'string' || !path) {
          continue
        }
        // A localized `_status` publishes each locale on its own, and the query above only
        // guarantees that *some* locale is published.
        if (!draft && !isLiveRow(doc, collection, pathLocale || undefined)) {
          continue
        }
        entries.push({
          id: doc.id as DefaultDocumentIDType,
          collection: collection.slug,
          ...(pathLocale === '' ? {} : { locale: pathLocale }),
          path,
          title: pickLocalizedValue(doc[labelField], pathLocale) ?? null,
          updatedAt: doc.updatedAt as string,
        })
      }
    }
    return entries
  }

  // Enumerating concurrently turns the per-collection round-trip latency into a single wait —
  // unless the caller's request carries a transaction, whose database session must not run
  // concurrent operations (the same guard findPageByPath applies).
  const results = req.transactionID
    ? await sequentially(collections, enumerateCollection)
    : await Promise.all(collections.map((collection) => enumerateCollection(collection)))

  return results.flat()
}

/** The change one write caused to one document's live path, as reported by {@link pathChanges}. */
export type PathChange = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  /** Present on a localized install only: the locale the paths belong to. */
  locale?: string
  /** The live path after the write; null when the path no longer resolves. */
  path: null | string
  /** The live path before the write; null when the path did not resolve before it. */
  previousPath: null | string
}

type AfterChangeArgs = Parameters<CollectionAfterChangeHook>[0]
type AfterDeleteArgs = Parameters<CollectionAfterDeleteHook>[0]

/**
 * Reports which live paths a write started or stopped resolving, for the written document and —
 * when a live path moved — for every descendant whose path moved with it.
 *
 * @experimental This API is experimental and may change or be removed in a future minor
 * release without a breaking-change bump. It needs more real-world testing before it is
 * marked stable.
 *
 * Call it from a page collection's own `afterChange` and `afterDelete` hooks with the hook's
 * arguments. A draft save or autosave tick reports no changes; a rename staged in a draft is
 * reported when it is published, carrying the previously published path as `previousPath`
 * (which `previousDoc` cannot supply). Rejects rather than returning a short list — await it,
 * or chain `.catch()` when running it off the critical path.
 *
 * With the parent deletion guard disabled or skipped, a bulk delete that removes a parent
 * together with one of its descendants reports the descendant twice: once from its own
 * `afterDelete` and once as the parent's orphaned descendant. Purging a path twice is
 * harmless, so the entries are not deduplicated across hook invocations:
 *
 * @example
 * ```ts
 * afterChange: [
 *   async (args) => {
 *     for (const change of await pathChanges(args)) {
 *       await revalidate(change.previousPath, change.path)
 *     }
 *   },
 * ]
 * ```
 */
export async function pathChanges(args: AfterChangeArgs | AfterDeleteArgs): Promise<PathChange[]> {
  const { collection, req } = args
  asPageCollectionConfigOrThrow(collection)

  const localized = Boolean(req.payload.config.localization)

  // afterDelete: everything the document and its captured descendants resolved is gone
  if (!('operation' in args)) {
    const capture = readCapture(args.id, collection.slug, req)

    const changes = diffDocPaths(capture, noDocPaths(), {
      id: args.id,
      collection: collection.slug,
      localized,
    })

    for (const descendant of capture.descendants ?? []) {
      changes.push(
        ...diffDocPaths({ live: descendant.live, paths: descendant.paths }, noDocPaths(), {
          id: descendant.id,
          collection: descendant.collection,
          localized,
        }),
      )
    }

    return changes
  }

  const { doc, operation } = args

  // A draft save or autosave tick writes only a version row and cannot change a live path.
  if (isVersionOnlyWrite(req.context, doc._status)) {
    return []
  }

  const previous = operation === 'create' ? noDocPaths() : readCapture(doc.id, collection.slug, req)
  const current =
    (await computeDocPaths({ id: doc.id, collectionConfig: collection, req })) ?? noDocPaths()

  const changes = diffDocPaths(previous, current, {
    id: doc.id,
    collection: collection.slug,
    localized,
  })

  // Only a changed path segment moves descendant paths, so pure liveness flips — publish,
  // unpublish, trash, restore — issue no subtree query: their before and after paths are equal.
  // A write that renames a slug while also flipping liveness (rename + unpublish in one write,
  // restore from trash under a new slug) still moves the descendants, whose own liveness is
  // independent of the ancestor's, so the walk keys on the path difference alone. A create
  // cannot have descendants and skips the walk outright.
  const moved = operation !== 'create' && !recordsEqual(previous.paths, current.paths)

  if (moved) {
    const root = { id: doc.id as DefaultDocumentIDType, collection: collection.slug }
    const rows = await loadDescendants({ req, root })
    const before = assembleDescendantPaths(previous.paths, root, rows)
    const after = assembleDescendantPaths(current.paths, root, rows)

    for (const [index, row] of rows.entries()) {
      changes.push(
        ...diffDocPaths(
          { live: row.live, paths: before[index].paths },
          { live: row.live, paths: after[index].paths },
          { id: row.id, collection: row.collection, localized },
        ),
      )
    }
  }

  return changes
}

/** Reads a stashed pre-write capture back, loudly: a missing or failed capture must not silently shorten the result. */
function readCapture(
  id: DefaultDocumentIDType,
  collection: CollectionSlug,
  req: PayloadRequest,
): PathCapture {
  const capture = pathCaptures(req.context)[`${collection}:${String(id)}`]

  if (!capture) {
    throw new Error(
      `[Pages Plugin] pathChanges found no captured pre-write state for "${collection}:${String(id)}". ` +
        'It must be called from an afterChange or afterDelete hook of a page collection, with the arguments the hook received.',
    )
  }
  if (capture.error) {
    throw capture.error instanceof Error ? capture.error : new Error(String(capture.error))
  }

  return capture
}

/** The per-locale differences between two path states of one document. */
function diffDocPaths(
  previous: DocPaths,
  current: DocPaths,
  {
    id,
    collection,
    localized,
  }: { collection: CollectionSlug; id: DefaultDocumentIDType; localized: boolean },
): PathChange[] {
  const locales = new Set([...Object.keys(current.paths), ...Object.keys(previous.paths)])

  const changes: PathChange[] = []
  for (const locale of locales) {
    const previousPath = (previous.live[locale] ? previous.paths[locale] : undefined) ?? null
    const path = (current.live[locale] ? current.paths[locale] : undefined) ?? null
    if (previousPath !== path) {
      changes.push({
        id,
        collection,
        ...(localized ? { locale } : {}),
        path,
        previousPath,
      })
    }
  }
  return changes
}

/** Picks a localized field's value (`locale`-keyed object) or passes an unlocalized one through. */
function pickLocalizedValue(value: unknown, locale: string): null | string {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && locale) {
    const localized = (value as Record<string, unknown>)[locale]
    return typeof localized === 'string' ? localized : null
  }
  return null
}

function recordsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

async function sequentially<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (const item of items) {
    results.push(await fn(item))
  }
  return results
}
