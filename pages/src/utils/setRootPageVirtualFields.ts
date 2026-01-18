import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { SeoMetadata } from '../types/SeoMetadata.js'

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
  breadcrumbLabelField,
  doc,
  locale,
  locales,
}: {
  breadcrumbLabelField: string
  doc: Record<string, any>
  locale: Locale | undefined
  locales: Locale[] | undefined
}) {
  if (locales && locale) {
    const paths = locales.reduce(
      (acc, locale) => {
        // If the doc does not have a slug for this locale, exclude the path to not generate a 404 path
        if (
          (typeof doc.slug === 'object' && doc.slug[locale] === ROOT_PAGE_SLUG) ||
          (typeof doc.slug === 'string' && doc.slug === ROOT_PAGE_SLUG)
        ) {
          acc[locale] = `/${locale}`
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
      const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce(
        (acc, locale) => {
          acc[locale] = [
            {
              slug: ROOT_PAGE_SLUG,
              label: doc[breadcrumbLabelField][locale],
              path: paths[locale],
            },
          ]
          return acc
        },
        {} as Record<Locale, Breadcrumb[]>,
      )

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
        breadcrumbs: [
          {
            slug: ROOT_PAGE_SLUG,
            label: doc[breadcrumbLabelField],
            path: `/${locale}`,
          },
        ],
        meta: {
          ...doc.meta,
          alternatePaths,
        },
        path: paths[locale],
      }
    }
  } else {
    return {
      ...doc,
      breadcrumbs: [
        {
          slug: ROOT_PAGE_SLUG,
          label: doc[breadcrumbLabelField],
          path: '/',
        },
      ],
      path: '/',
    }
  }
}
