import type { CollectionSlug, PayloadRequest } from 'payload'

import { stringify } from 'qs-esm'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'

import { extractID } from './extractID.js'
import { asPageCollectionConfig } from './pageCollectionConfigHelpers.js'
import { pathFromBreadcrumbs } from './pathFromBreadcrumbs.js'
import { ROOT_PAGE_SLUG } from './setRootPageVirtualFields.js'

/** Returns the breadcrumbs to the given document. */
export async function getBreadcrumbs({
  apiURL,
  breadcrumbLabelField,
  data,
  locale,
  locales,
  parentCollection,
  parentField,
  req,
}: {
  /**
   * Base URL of the Payload REST API (e.g. `${serverURL}${routes.api}`).
   * Required when `req` is undefined (i.e. when called from a client component)
   * so the plugin respects a user-customized `routes.api`.
   */
  apiURL?: string
  breadcrumbLabelField: string
  data: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  locales: Locale[] | undefined
  parentCollection: CollectionSlug
  parentField: string
  req: PayloadRequest | undefined // undefined when called from the client (e.g. when using the PathField)
}): Promise<Breadcrumb[] | Record<Locale, Breadcrumb[]>> {
  const getCurrentDocBreadcrumb = (locale: Locale | undefined, parentBreadcrumbs: Breadcrumb[]) =>
    docToBreadcrumb(
      {
        ...data,
        path: pathFromBreadcrumbs({
          additionalSlug: data.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(data.slug, locale),
          breadcrumbs: parentBreadcrumbs,
          locale,
        }),
      },
      locale,
      breadcrumbLabelField,
    )

  // If the document has no parent, only return the breadcrumb for the current locale and return
  if (!data[parentField]) {
    if (locale === 'all' && locales) {
      return Object.fromEntries(
        locales.map((locale) => [locale, [getCurrentDocBreadcrumb(locale, [])]]),
      )
    }

    return [getCurrentDocBreadcrumb(locale, [])]
  }

  // If the parent is set, resolve its breadcrumbs, add the breadcrumb of the current doc and return
  const parentId = extractID(data[parentField])

  if (!parentId) {
    throw new Error('Parent ID not found for document with id ' + data.id)
  }

  if (!req) {
    // Client path: fetch the parent's pre-computed breadcrumbs via the REST API.
    if (!apiURL) {
      throw new Error('[Pages Plugin] getBreadcrumbs requires `apiURL` when called without `req`.')
    }
    const query = stringify({ depth: 0, locale, select: { breadcrumbs: true } })
    const response = await fetch(`${apiURL}/${parentCollection}/${parentId}?${query}`, {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch the parent document via the Payload REST API. ${response.statusText}`,
      )
    }
    const parent = (await response.json()) as Record<string, unknown>

    if (locale === 'all' && locales) {
      return locales.reduce(
        (acc, locale) => {
          const parentBreadcrumbs =
            (parent?.breadcrumbs as Record<Locale, Breadcrumb[]>)?.[locale] ?? []

          acc[locale] = [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
          return acc
        },
        {} as Record<Locale, Breadcrumb[]>,
      )
    }

    const parentBreadcrumbs = (parent?.breadcrumbs as Breadcrumb[]) ?? []
    return [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
  }

  // Server path: walk the ancestor chain iteratively with lean, batched lookups instead of
  // recursively re-computing each ancestor's own virtual fields. Every level only fetches the
  // raw fields breadcrumb assembly depends on (slug, parent, isRootPage, label field), so the
  // full hook pipeline (and the per-level virtual-field computation for all locales) is skipped.
  const chain = await loadAncestorChain({
    docId: data.id,
    locale,
    parentCollection,
    parentId,
    req,
  })

  const buildBreadcrumbs = (locale: Locale | undefined): Breadcrumb[] => {
    const parentBreadcrumbs = breadcrumbsFromChain(chain, locale)
    return [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
  }

  if (locale === 'all' && locales) {
    return Object.fromEntries(locales.map((locale) => [locale, buildBreadcrumbs(locale)]))
  }

  return buildBreadcrumbs(locale)
}

/** One resolved ancestor level, ordered nearest-first in the chain. */
type AncestorChainEntry =
  | {
      /** Breadcrumbs stored on a parent whose collection is not a page collection (chain end). */
      storedBreadcrumbs: unknown
    }
  | {
      doc: Record<string, unknown>
      isRootPage: boolean
      labelField: string
    }

/**
 * Resolves all ancestors of a document, nearest ancestor first.
 *
 * Each level is fetched with a lean select of only the fields the breadcrumb assembly needs.
 * Since no virtual field is selected, the ancestor's own beforeRead hook returns early and no
 * recursive virtual-field computation happens.
 */
async function loadAncestorChain({
  docId,
  locale,
  parentCollection,
  parentId,
  req,
}: {
  docId: number | string
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  parentCollection: CollectionSlug
  parentId: number | string
  req: PayloadRequest
}): Promise<AncestorChainEntry[]> {
  const chain: AncestorChainEntry[] = []
  const seen = new Set<string>()

  let collectionSlug = parentCollection
  let id = parentId
  let childId: number | string = docId

  while (true) {
    const seenKey = `${collectionSlug}:${id}`
    if (seen.has(seenKey)) {
      throw new Error(
        `Circular parent reference detected while resolving the breadcrumbs of document with id ${docId}: document with id ${id} in collection ${collectionSlug} is its own ancestor.`,
      )
    }
    seen.add(seenKey)

    const collectionConfig = req.payload.collections[collectionSlug]?.config
    const pageConfig = collectionConfig ? asPageCollectionConfig(collectionConfig) : null

    if (!pageConfig) {
      // The parent collection is not a page collection: use its stored breadcrumbs (if any) and stop.
      const doc = await loadAncestor({
        id,
        collection: collectionSlug,
        locale,
        req,
        select: { breadcrumbs: true },
      })
      if (!doc) {
        throw new Error(
          'Parent document with id ' + id + ' of document with id ' + childId + ' not found.',
        )
      }
      chain.push({ storedBreadcrumbs: doc.breadcrumbs })
      return chain
    }

    const labelField = pageConfig.page.breadcrumbs.labelField
    const parentFieldName = pageConfig.page.parent.name

    const doc = await loadAncestor({
      id,
      collection: collectionSlug,
      locale,
      req,
      select: {
        slug: true,
        [labelField]: true,
        [parentFieldName]: true,
        ...(pageConfig.page.isRootCollection ? { isRootPage: true } : {}),
      },
    })

    if (!doc) {
      // This can be the case, when the parent document got deleted.
      throw new Error(
        'Parent document with id ' + id + ' of document with id ' + childId + ' not found.',
      )
    }

    chain.push({ doc, isRootPage: doc.isRootPage === true, labelField })

    const nextParentRef = doc[parentFieldName]
    if (doc.isRootPage === true || !nextParentRef) {
      return chain
    }

    const nextParentId = extractID(nextParentRef)
    if (!nextParentId) {
      throw new Error('Parent ID not found for document with id ' + id)
    }

    childId = id
    id = nextParentId
    collectionSlug = pageConfig.page.parent.collection
  }
}

/** Assembles the breadcrumbs of the ancestor chain (root first) for a single locale. */
function breadcrumbsFromChain(
  chain: AncestorChainEntry[],
  locale: Locale | undefined,
): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = []

  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i]

    if ('storedBreadcrumbs' in entry) {
      const stored = entry.storedBreadcrumbs
      const storedForLocale =
        locale && stored && typeof stored === 'object' && !Array.isArray(stored)
          ? (stored as Record<Locale, Breadcrumb[]>)[locale]
          : (stored as Breadcrumb[] | undefined)
      breadcrumbs.push(...(storedForLocale ?? []))
      continue
    }

    const slug = entry.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(entry.doc.slug, locale)

    breadcrumbs.push({
      slug: slug!,
      label: pickFieldValue(entry.doc[entry.labelField], locale)!,
      // The root page's path is `/` (or `/${locale}`), which pathFromBreadcrumbs
      // yields as an empty string for unlocalized setups — normalize it to `/`.
      path: pathFromBreadcrumbs({ additionalSlug: slug, breadcrumbs, locale }) || '/',
    })
  }

  return breadcrumbs
}

/** Converts a localized or unlocalized document to a breadcrumb item. */
function docToBreadcrumb(
  doc: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined,
  breadcrumbLabelField?: string,
): Breadcrumb {
  return {
    slug: doc.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(doc.slug, locale)!,
    label: breadcrumbLabelField
      ? pickFieldValue(doc[breadcrumbLabelField], locale)
      : typeof doc.breadcrumbs === 'object' && locale
        ? doc.breadcrumbs?.[locale]?.at(-1)?.label
        : doc.breadcrumbs?.at(-1)?.label,
    path: pickFieldValue(doc.path, locale)!,
  }
}

/** Picks the value of a localized or unlocalized field. */
function pickFieldValue(field: any, locale: Locale | undefined): string | undefined {
  if (typeof field === 'string') {
    return field
  }

  if (typeof field === 'object' && locale) {
    return field[locale]
  }

  return undefined
}

const ANCESTOR_CACHE_KEY = 'pagesPluginAncestorCache'

type AncestorLoaderState = {
  /** Batches waiting to be flushed, keyed by `${collection}:${locale}`. */
  batches: Map<string, PendingAncestorBatch>
  /** Resolved or in-flight ancestor lookups, keyed by `${collection}:${id}:${locale}`. */
  cache: Map<string, Promise<null | Record<string, unknown>>>
}

type PendingAncestorBatch = {
  requests: Map<
    number | string,
    {
      reject: (error: unknown) => void
      resolve: (doc: null | Record<string, unknown>) => void
    }
  >
  select: Record<string, true>
}

/**
 * Schedules a batch flush after the current run of microtasks, so that all ancestor lookups
 * issued in the same event-loop turn (e.g. by beforeRead hooks running concurrently via
 * Promise.all for all docs of a list query) are collected into a single batched query.
 */
const scheduleBatchFlush: (flush: () => void) => void =
  typeof setImmediate === 'function'
    ? (flush) => setImmediate(flush)
    : (flush) => setTimeout(flush, 0)

/**
 * Fetches an ancestor document with request-scoped caching and batching.
 *
 * - **Caching**: lookups are cached as Promises (not resolved values), so concurrent lookups
 *   for the same ancestor (e.g. siblings sharing a parent) share a single query even before
 *   the first one resolves.
 * - **Batching**: distinct ancestor IDs requested in the same event-loop turn are collected
 *   and fetched with a single `find` query per collection and tree level, instead of one
 *   query per distinct ancestor.
 */
function loadAncestor({
  id,
  collection,
  locale,
  req,
  select,
}: {
  collection: CollectionSlug
  id: number | string
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
  select: Record<string, true>
}): Promise<null | Record<string, unknown>> {
  // Note: The cache and batch keys do not include draft status because both are request-scoped
  // and context.draft is constant within a single request — a draft and non-draft lookup
  // for the same parent cannot collide in the same cache.
  const state = (req.context[ANCESTOR_CACHE_KEY] ??= {
    batches: new Map(),
    cache: new Map(),
  }) as AncestorLoaderState

  const cacheKey = `${collection}:${id}:${locale ?? ''}`
  const cached = state.cache.get(cacheKey)
  if (cached) {
    return cached
  }

  const batchKey = `${collection}:${locale ?? ''}`
  const pendingBatch = state.batches.get(batchKey)
  let batch: PendingAncestorBatch

  if (pendingBatch) {
    batch = pendingBatch
    // Ancestors of the same collection may be requested with different selects
    // (e.g. different label fields) — merge them into one lean select.
    Object.assign(batch.select, select)
  } else {
    const newBatch: PendingAncestorBatch = { requests: new Map(), select: { ...select } }
    batch = newBatch
    state.batches.set(batchKey, newBatch)

    scheduleBatchFlush(() => {
      state.batches.delete(batchKey)
      void flushAncestorBatch({ batch: newBatch, collection, locale, req, state })
    })
  }

  const promise = new Promise<null | Record<string, unknown>>((resolve, reject) => {
    batch.requests.set(id, { reject, resolve })
  })

  state.cache.set(cacheKey, promise)
  return promise
}

/** Executes the batched query of one pending batch and settles all its lookups. */
async function flushAncestorBatch({
  batch,
  collection,
  locale,
  req,
  state,
}: {
  batch: PendingAncestorBatch
  collection: CollectionSlug
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
  state: AncestorLoaderState
}): Promise<void> {
  const ids = [...batch.requests.keys()]

  try {
    const result = await req.payload.find({
      collection,
      depth: 0,
      draft: req.context.draft === true,
      limit: ids.length,
      locale,
      overrideAccess: true,
      pagination: false,
      req: {
        ...req,
        // generateVirtualFields is explicitly disabled: it may be inherited as `true` from the
        // outer operation's context, which would re-trigger the recursive virtual-field
        // computation this lean lookup exists to avoid.
        context: { ...req.context, [ANCESTOR_CACHE_KEY]: state, generateVirtualFields: false },
      },
      select: batch.select,
      where: { id: { in: ids } },
    })

    const docsById = new Map(
      (result.docs as Record<string, unknown>[]).map((doc) => [String(doc.id), doc]),
    )

    for (const [id, { resolve }] of batch.requests) {
      resolve(docsById.get(String(id)) ?? null)
    }
  } catch (error) {
    for (const [id] of batch.requests) {
      state.cache.delete(`${collection}:${id}:${locale ?? ''}`)
    }
    for (const [, { reject }] of batch.requests) {
      reject(error)
    }
  }
}
