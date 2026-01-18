import type { PayloadRequest } from 'payload'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { SeoMetadata } from '../types/SeoMetadata.js'

import { getBreadcrumbs } from './getBreadcrumbs.js'

/** Sets the virtual fields (breadcrumbs, path, alternatePaths) of the given root page document. */
export async function setPageDocumentVirtualFields({
  doc,
  locale,
  locales,
  pageConfigAttributes,
  req,
}: {
  doc: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  locales: Locale[] | undefined
  pageConfigAttributes: PageCollectionConfigAttributes
  req: PayloadRequest | undefined
}) {
  if (locales && locale) {
    const breadcrumbs = (await getBreadcrumbs({
      breadcrumbLabelField: pageConfigAttributes.breadcrumbs.labelField,
      data: doc,
      locales,
      parentCollection: pageConfigAttributes.parent.collection,
      parentField: pageConfigAttributes.parent.name,
      req,
      // For localized pages, we need to fetch the breadcrumbs for all locales in order to correctly set the alternate paths
      locale: 'all',
    })) as Record<Locale, Breadcrumb[]>

    const paths: Record<Locale, string> = locales.reduce(
      (acc, locale) => {
        // If the slug is not set for this locale, exclude the path to not generate a 404 path
        if (
          (typeof doc.slug === 'object' && doc.slug[locale]) ||
          (typeof doc.slug === 'string' && doc.slug)
        ) {
          acc[locale] = breadcrumbs[locale].at(-1)!.path
        }
        return acc
      },
      {} as Record<Locale, string>,
    )

    const alternatePaths: SeoMetadata['alternatePaths'] = Object.entries(paths).map(
      ([locale, path]) => ({
        hreflang: locale,
        path,
      }),
    )

    if (locale === 'all') {
      return {
        ...doc,
        breadcrumbs,
        meta: {
          ...doc.meta,
          alternatePaths,
        },
        path: paths,
      }
    } else {
      return {
        ...doc,
        breadcrumbs: breadcrumbs[locale],
        meta: {
          ...doc.meta,
          alternatePaths,
        },
        path: paths[locale],
      }
    }
  } else {
    const breadcrumbs = (await getBreadcrumbs({
      breadcrumbLabelField: pageConfigAttributes.breadcrumbs.labelField,
      data: doc,
      locale: undefined,
      locales,
      parentCollection: pageConfigAttributes.parent.collection,
      parentField: pageConfigAttributes.parent.name,
      req,
    })) as Breadcrumb[]

    return {
      ...doc,
      breadcrumbs,
      path: breadcrumbs.at(-1)!.path,
    }
  }
}
