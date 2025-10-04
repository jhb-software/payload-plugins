import { CollectionSlug, PayloadRequest, Where } from 'payload'
import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'
import { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import { fetchRestApi } from './fetchRestApi.js'
import { pathFromBreadcrumbs } from './pathFromBreadcrumbs.js'
import { ROOT_PAGE_SLUG } from './setRootPageVirtualFields.js'

/** Returns the breadcrumbs to the given document. */
export async function getBreadcrumbs({
  req,
  locales,
  breadcrumbLabelField,
  parentField,
  parentCollection,
  data,
  locale,
}: {
  req: PayloadRequest | undefined // undefined when called from the client (e.g. when using the PathField)
  locales: Locale[] | undefined
  breadcrumbLabelField: string
  parentField: string
  parentCollection: CollectionSlug
  data: Record<string, any>
  locale: Locale | 'all' | undefined
}): Promise<Breadcrumb[] | Record<Locale, Breadcrumb[]>> {
  const getCurrentDocBreadcrumb = (locale: Locale | undefined, parentBreadcrumbs: Breadcrumb[]) =>
    docToBreadcrumb(
      {
        ...data,
        path: pathFromBreadcrumbs({
          locale,
          breadcrumbs: parentBreadcrumbs,
          additionalSlug: data.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(data.slug, locale),
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

  // TODO: if the parent is an object and has the breadcrumbs already set, it may not be necessary to fetch the parent document again

  if (!parentId) {
    throw new Error('Parent ID not found for document ' + data.id)
  }

  const parent = req
    ? await req.payload.findByID({
        id: parentId,
        collection: parentCollection,
        depth: 0,
        locale: locale,
        disableErrors: true,
        select: {
          breadcrumbs: true,
        },
        // IMPORTANT: do not pass the req here, otherwise there will be issues with the locale flattening
      })
    : await fetchRestApi(`/${parentCollection}/${parentId}`, {
        depth: 0,
        locale: locale,
        select: {
          breadcrumbs: true,
        },
      })

  if (!parent) {
    // This can be the case, when the parent document got deleted.
    throw new Error('Parent document of document ' + data.id + ' not found.')
  }

  if (locale === 'all' && locales) {
    const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce(
      (acc, locale) => {
        const parentBreadcrumbs = (parent?.breadcrumbs as any)[locale] ?? []

        acc[locale] = [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
        return acc
      },
      {} as Record<Locale, Breadcrumb[]>,
    )

    return breadcrumbs
  } else {
    const parentBreadcrumbs = (parent?.breadcrumbs as any) ?? []

    return [...parentBreadcrumbs, getCurrentDocBreadcrumb(locale, parentBreadcrumbs)]
  }
}

/** Converts a localized or unlocalized document to a breadcrumb item. */
function docToBreadcrumb(
  doc: Record<string, any>,
  locale: Locale | 'all' | undefined,
  breadcrumbLabelField?: string | undefined,
): Breadcrumb {
  if (!doc.slug) {
    console.warn(
      'Slug not found for document ' + doc.id + '. Cannot convert document to breadcrumb.',
    )
  }
  if (!doc.path) {
    console.warn(
      'Path not found for document ' + doc.id + '. Cannot convert document to breadcrumb.',
    )
  }
  if (breadcrumbLabelField && !doc[breadcrumbLabelField]) {
    console.warn(
      'Breadcrumb label field not found for document ' +
        doc.id +
        '. Cannot convert document to breadcrumb.',
    )
  }

  return {
    slug: doc.isRootPage ? ROOT_PAGE_SLUG : pickFieldValue(doc.slug, locale)!,
    path: pickFieldValue(doc.path, locale)!,
    label: breadcrumbLabelField
      ? pickFieldValue(doc[breadcrumbLabelField], locale)
      : typeof doc.breadcrumbs === 'object' && locale
        ? doc.breadcrumbs?.[locale]?.at(-1)?.label
        : doc.breadcrumbs?.at(-1)?.label,
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

  console.warn('Could not pick field value for field', field, 'and locale', locale)
  return undefined
}
