import type { CollectionSlug, PayloadRequest } from 'payload'

import { stringify } from 'qs-esm'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'

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

  // If the parent is set, fetch its breadcrumbs, add the breadcrumb of the current doc and return
  const parentId =
    typeof data[parentField] === 'string' || typeof data[parentField] === 'number'
      ? data[parentField]
      : data[parentField].id

  if (!parentId) {
    throw new Error('Parent ID not found for document with id ' + data.id)
  }

  let parent: null | Record<string, unknown> | undefined
  if (req) {
    parent = await findByIDCached({
      id: parentId,
      collection: parentCollection,
      locale,
      req,
    })
  } else {
    if (!apiURL) {
      throw new Error(
        '[Pages Plugin] getBreadcrumbs requires `apiURL` when called without `req`.',
      )
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
    parent = (await response.json()) as Record<string, unknown>
  }

  if (!parent) {
    // This can be the case, when the parent document got deleted.
    throw new Error(
      'Parent document with id ' + parentId + ' of document with id ' + data.id + ' not found.',
    )
  }

  if (locale === 'all' && locales) {
    const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce(
      (acc, locale) => {
        const parentBreadcrumbs =
          (parent?.breadcrumbs as Record<Locale, Breadcrumb[]>)?.[locale] ?? []

        acc[locale] = [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
        return acc
      },
      {} as Record<Locale, Breadcrumb[]>,
    )

    return breadcrumbs
  } else {
    const parentBreadcrumbs = (parent?.breadcrumbs as Breadcrumb[]) ?? []

    return [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
  }
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

/**
 * Fetches a parent document by ID with request-scoped caching to avoid redundant DB queries.
 *
 * The cache stores Promises rather than resolved values. This is important because Payload's
 * beforeRead hooks run concurrently (via Promise.all) for all docs in a list query. If we cached
 * the resolved value, every sibling would fire its own DB query before the first one resolves and
 * populates the cache. By caching the Promise immediately, all concurrent lookups for the same
 * ancestor receive the same in-flight Promise and only a single DB query is executed.
 */
async function findByIDCached({
  id,
  collection,
  locale,
  req,
}: {
  collection: CollectionSlug
  id: number | string
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
}): Promise<null | Record<string, unknown>> {
  // Note: The cache key does not include draft status because the cache is request-scoped
  // and context.draft is constant within a single request — a draft and non-draft lookup
  // for the same parent cannot collide in the same cache.
  const cacheKey = `${collection}:${id}:${locale ?? ''}`
  // Cache the Promise (not the resolved value) so that concurrent lookups for the same
  // parent (e.g. beforeRead hooks running in parallel via Promise.all) share a single DB query.
  const cache = (req.context[ANCESTOR_CACHE_KEY] ??= new Map()) as Map<
    string,
    Promise<null | Record<string, unknown>>
  >

  let parentPromise = cache.get(cacheKey)

  if (!parentPromise) {
    parentPromise = req.payload
      .findByID({
        id,
        collection,
        depth: 0,
        disableErrors: true,
        draft: req.context.draft === true,
        locale,
        overrideAccess: true,
        req: {
          ...req,
          context: { ...req.context, [ANCESTOR_CACHE_KEY]: cache },
        },
        select: {
          breadcrumbs: true,
        },
      })
      .then((result) => result ?? null)
      .catch((error) => {
        cache.delete(cacheKey)
        throw error
      })

    cache.set(cacheKey, parentPromise)
  }

  return parentPromise
}
