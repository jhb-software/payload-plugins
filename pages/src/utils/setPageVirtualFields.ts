import type { PayloadRequest } from 'payload'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'

import { alternatePathsFor } from './alternatePaths.js'
import { getBreadcrumbs } from './getBreadcrumbs.js'
import { localePrefixMap } from './localePrefix.js'

/** Sets the virtual fields (breadcrumbs, path, alternatePaths) of the given root page document. */
export async function setPageDocumentVirtualFields({
  doc,
  draft,
  locale,
  locales,
  pageConfigAttributes,
  req,
  routing,
}: {
  doc: Record<string, any>
  /** Whether the ancestors the paths are built from resolve to their latest version. */
  draft: boolean
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  locales: Locale[] | undefined
  pageConfigAttributes: PageCollectionConfigAttributes
  req: PayloadRequest
  routing: LocaleRouting | undefined
}) {
  const localePrefixes = localePrefixMap(locales, routing)

  if (locales && locale) {
    const breadcrumbs = (await getBreadcrumbs({
      data: doc,
      draft,
      localePrefixes,
      locales,
      pageConfig: pageConfigAttributes,
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

    const alternatePaths = alternatePathsFor(paths, routing)

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
      data: doc,
      draft,
      locale: undefined,
      localePrefixes,
      locales,
      pageConfig: pageConfigAttributes,
      req,
    })) as Breadcrumb[]

    return {
      ...doc,
      breadcrumbs,
      path: breadcrumbs.at(-1)!.path,
    }
  }
}
