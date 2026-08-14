import type { CollectionSlug, PayloadRequest } from 'payload'

import { stringify } from 'qs-esm'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { Ancestor } from './loadAncestors.js'

import { loadAncestorChain } from './loadAncestors.js'
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

  // If the parent is set, fetch the ancestor chain, add the breadcrumb of the current doc and return
  const parentId =
    typeof data[parentField] === 'string' || typeof data[parentField] === 'number'
      ? data[parentField]
      : data[parentField].id

  if (!parentId) {
    throw new Error('Parent ID not found for document with id ' + data.id)
  }

  let parentBreadcrumbsFor: (locale: Locale | undefined) => Breadcrumb[]

  if (req) {
    const ancestors = await loadAncestorChain({
      id: parentId,
      collection: parentCollection,
      docId: data.id,
      locale,
      req,
    })

    parentBreadcrumbsFor = (locale) => ancestorsToBreadcrumbs(ancestors, locale)
  } else {
    // Client components have no `req`, so the parent's already-computed breadcrumbs are read
    // through the REST API instead of walking the chain.
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
    const parent = (await response.json()) as Record<string, unknown> | undefined

    if (!parent) {
      // This can be the case, when the parent document got deleted.
      throw new Error(
        'Parent document with id ' + parentId + ' of document with id ' + data.id + ' not found.',
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
function ancestorsToBreadcrumbs(ancestors: Ancestor[], locale: Locale | undefined): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = []

  for (const ancestor of ancestors) {
    const slug = ancestor.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(ancestor.slug, locale)!

    breadcrumbs.push({
      slug,
      label: pickFieldValue(ancestor.label, locale)!,
      path: ancestor.isRootPage
        ? rootPagePath(ancestor, locale)!
        : pathFromBreadcrumbs({ additionalSlug: slug, breadcrumbs, locale }),
    })
  }

  return breadcrumbs
}

/**
 * The path of a root page, which is the locale prefix (or `/`) rather than a path assembled
 * from slugs. A locale the root page has no slug for has no path, mirroring
 * `setRootPageDocumentVirtualFields`.
 */
function rootPagePath(ancestor: Ancestor, locale: Locale | undefined): string | undefined {
  if (!locale) {
    return '/'
  }

  return pickFieldValue(ancestor.slug, locale) === ROOT_PAGE_SLUG ? `/${locale}` : undefined
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
