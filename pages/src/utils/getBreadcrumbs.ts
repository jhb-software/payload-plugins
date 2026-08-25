import type { PayloadRequest } from 'payload'

import { stringify } from 'qs-esm'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { Ancestor } from './loadAncestors.js'

import { loadAncestorChain } from './loadAncestors.js'
import { rootPathFromPrefixes } from './localePrefix.js'
import { resolveParentRef } from './parentRef.js'
import { pathFromBreadcrumbs } from './pathFromBreadcrumbs.js'
import { ROOT_PAGE_SLUG } from './setRootPageVirtualFields.js'

/** Returns the breadcrumbs to the given document. */
export async function getBreadcrumbs({
  apiURL,
  data,
  draft,
  locale,
  localePrefixes,
  locales,
  pageConfig,
  req,
}: {
  /**
   * Base URL of the Payload REST API (e.g. `${serverURL}${routes.api}`).
   * Required when `req` is undefined (i.e. when called from a client component)
   * so the plugin respects a user-customized `routes.api`.
   */
  apiURL?: string
  data: Record<string, any>
  /**
   * Whether the ancestors are resolved to their latest version. Belongs to the operation the
   * breadcrumbs are computed for, so it travels with the call instead of being read off the
   * request. Ignored when `req` is undefined: the client path reads the parent's already
   * computed breadcrumbs through the REST API.
   */
  draft: boolean
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  /** Each locale's path prefix. Without it every locale is prefixed with `/<locale>`. */
  localePrefixes?: Record<Locale, string>
  locales: Locale[] | undefined
  /** Page config of the collection `data` belongs to. Every ancestor resolves its own. */
  pageConfig: PageCollectionConfigAttributes
  req: PayloadRequest | undefined // undefined when called from the client (e.g. when using the PathField)
}): Promise<Breadcrumb[] | Record<Locale, Breadcrumb[]>> {
  const breadcrumbLabelField = pageConfig.breadcrumbs.labelField
  const parentField = pageConfig.parent.name
  const getCurrentDocBreadcrumb = (locale: Locale | undefined, parentBreadcrumbs: Breadcrumb[]) =>
    docToBreadcrumb(
      {
        ...data,
        path: pathFromBreadcrumbs({
          additionalSlug: data.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(data.slug, locale),
          breadcrumbs: parentBreadcrumbs,
          locale,
          localePrefixes,
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

  // If the parent is set, fetch the ancestor chain, add the breadcrumb of the current doc and return
  const parentRef = resolveParentRef(data[parentField], pageConfig)

  if (!parentRef) {
    throw new Error('Parent ID not found for document with id ' + data.id)
  }

  let parentBreadcrumbsFor: (locale: Locale | undefined) => Breadcrumb[]

  if (req) {
    const ancestors = await loadAncestorChain({
      id: parentRef.id,
      collection: parentRef.collection,
      docId: data.id,
      draft,
      locale,
      req,
    })

    parentBreadcrumbsFor = (locale) => ancestorsToBreadcrumbs(ancestors, locale, localePrefixes)
  } else {
    // Client components have no `req`, so the parent's already-computed breadcrumbs are read
    // through the REST API instead of walking the chain.
    if (!apiURL) {
      throw new Error('[Pages Plugin] getBreadcrumbs requires `apiURL` when called without `req`.')
    }
    const query = stringify({ depth: 0, locale, select: { breadcrumbs: true } })
    const response = await fetch(`${apiURL}/${parentRef.collection}/${parentRef.id}?${query}`, {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch the parent document via the Payload REST API. ${response.statusText}`,
      )
    }
    const parent = (await response.json()) as Record<string, unknown> | undefined

    if (!parent) {
      // This can be the case, when the parent document got deleted.
      throw new Error(
        'Parent document with id ' +
          parentRef.id +
          ' of document with id ' +
          data.id +
          ' not found.',
      )
    }

    parentBreadcrumbsFor = (locale) =>
      (locale
        ? ((parent.breadcrumbs as Record<Locale, Breadcrumb[]> | undefined)?.[locale] ??
          (parent.breadcrumbs as Breadcrumb[] | undefined))
        : (parent.breadcrumbs as Breadcrumb[] | undefined)) ?? []
  }

  if (locale === 'all' && locales) {
    const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce(
      (acc, locale) => {
        const parentBreadcrumbs = parentBreadcrumbsFor(locale)

        acc[locale] = [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
        return acc
      },
      {} as Record<Locale, Breadcrumb[]>,
    )

    return breadcrumbs
  } else {
    const parentBreadcrumbs = parentBreadcrumbsFor(locale === 'all' ? undefined : locale)

    return [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
  }
}

/**
 * Assembles the breadcrumbs of an ancestor chain (ordered top-down) for a single locale.
 *
 * Each ancestor's path is built from the breadcrumbs above it, which is what the previous
 * implementation achieved by reading each ancestor's own computed `breadcrumbs` field.
 */
function ancestorsToBreadcrumbs(
  ancestors: Ancestor[],
  locale: Locale | undefined,
  localePrefixes: Record<Locale, string> | undefined,
): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = []

  for (const ancestor of ancestors) {
    const slug = ancestor.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(ancestor.slug, locale)!

    breadcrumbs.push({
      slug,
      label: pickFieldValue(ancestor.label, locale)!,
      // A root page is the site root of every locale — its path is the locale prefix (or `/`)
      // rather than a path assembled from slugs, and it does not depend on the locale carrying
      // a stored slug. Mirrors `setRootPageDocumentVirtualFields`.
      path: ancestor.isRootPage
        ? rootPathFromPrefixes(localePrefixes, locale)
        : pathFromBreadcrumbs({ additionalSlug: slug, breadcrumbs, locale, localePrefixes }),
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
