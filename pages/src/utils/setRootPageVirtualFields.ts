import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'
import { SeoMetadata } from '../types/SeoMetadata.js'

/**
 * The slug of the root page.
 * An empty string was chosen as the root page slug for two reasons:
 * 1. It allows the slug field to remain required, which wouldn't be possible if null/undefined were used
 * 2. It provides a consistent way to identify the root page in the URL structure
 *
 * This convention is used throughout the codebase when handling root page paths and breadcrumbs.
 */
export const ROOT_PAGE_SLUG = ''

/** Sets the slug field and virtual fields (breadcrumbs, path, alternatePaths) of the given root page document. */
export function setRootPageDocumentVirtualFields({
  doc,
  locale,
  locales,
  breadcrumbLabelField,
}: {
  doc: Record<string, any>
  locale: Locale | undefined
  locales: Locale[] | undefined
  breadcrumbLabelField: string
}) {
  if (locales && locale) {
    const paths = locales.reduce((acc, locale) => {
      // If the doc does not have a slug for this locale, exclude the path to not generate a 404 path
      if (
        (typeof doc.slug === 'object' && doc.slug[locale] === ROOT_PAGE_SLUG) ||
        (typeof doc.slug === 'string' && doc.slug === ROOT_PAGE_SLUG)
      ) {
        acc[locale] = `/${locale}`
      }
      return acc
    }, {} as Record<Locale, string>)

    const alternatePaths: SeoMetadata['alternatePaths'] = Object.entries(paths).map(
      ([locale, path]) => ({
        hreflang: locale as Locale,
        path,
      }),
    )

    if (locale === 'all') {
      const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce((acc, locale) => {
        acc[locale] = [
          {
            path: paths[locale],
            label: doc[breadcrumbLabelField][locale],
            slug: ROOT_PAGE_SLUG,
          },
        ]
        return acc
      }, {} as Record<Locale, Breadcrumb[]>)

      return {
        ...doc,
        path: paths,
        breadcrumbs: breadcrumbs,
        meta: {
          ...doc.meta,
          alternatePaths: alternatePaths,
        },
      }
    } else {
      return {
        ...doc,
        path: paths[locale],
        breadcrumbs: [
          {
            path: `/${locale}`,
            label: doc[breadcrumbLabelField],
            slug: ROOT_PAGE_SLUG,
          },
        ],
        meta: {
          ...doc.meta,
          alternatePaths: alternatePaths,
        },
      }
    }
  } else {
    return {
      ...doc,
      path: '/',
      breadcrumbs: [
        {
          path: '/',
          label: doc[breadcrumbLabelField],
          slug: ROOT_PAGE_SLUG,
        },
      ],
    }
  }
}
