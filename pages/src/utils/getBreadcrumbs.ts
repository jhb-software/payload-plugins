import type { CollectionSlug, PayloadRequest } from 'payload'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'

import { fetchRestApi } from './fetchRestApi.js'
import { pathFromBreadcrumbs } from './pathFromBreadcrumbs.js'
import { ROOT_PAGE_SLUG } from './setRootPageVirtualFields.js'

/** Returns the breadcrumbs to the given document. */
export async function getBreadcrumbs({
  breadcrumbLabelField,
  data,
  locale,
  locales,
  parentCollection,
  parentField,
  req,
}: {
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
    throw new Error('Parent ID not found for document ' + data.id)
  }

  const parent = req
    ? await req.payload.findByID({
        id: parentId,
        collection: parentCollection,
        depth: 0,
        disableErrors: true,
        locale,
        select: {
          breadcrumbs: true,
        },
        // IMPORTANT: do not pass the req here, otherwise there will be issues with the locale flattening
      })
    : await fetchRestApi<{ breadcrumbs: Breadcrumb[]; id: number | string }>(
        `/${parentCollection}/${parentId}`,
        {
          depth: 0,
          locale,
          select: {
            breadcrumbs: true,
          },
        },
      )

  if (!parent) {
    // This can be the case, when the parent document got deleted.
    throw new Error('Parent document of document ' + data.id + ' not found.')
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
