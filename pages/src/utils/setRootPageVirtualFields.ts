import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'

import { alternatePathsFor } from './alternatePaths.js'
import { rootPathForLocale } from './localePrefix.js'

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
  routing,
}: {
  breadcrumbLabelField: string
  doc: Record<string, unknown>
  locale: Locale | undefined
  locales: Locale[] | undefined
  routing: LocaleRouting | undefined
}) {
  if (locales && locale) {
    // Every locale gets a path. Unlike a regular page, whose per-locale slug decides whether it
    // has a path in that locale, a root page's slug is the constant `ROOT_PAGE_SLUG` — it is the
    // site root in every locale, including the ones the document has never been written in
    // (where the stored slug is still null).
    const paths = locales.reduce(
      (acc, locale) => {
        acc[locale] = rootPathForLocale(locale, routing)
        return acc
      },
      {} as Record<Locale, string>,
    )

    const alternatePaths = alternatePathsFor(paths, routing)

    if (locale === 'all') {
      const breadcrumbs: Record<Locale, Breadcrumb[]> = locales.reduce(
        (acc, locale) => {
          acc[locale] = [
            {
              slug: ROOT_PAGE_SLUG,
              label: (doc[breadcrumbLabelField] as Record<string, string>)[locale],
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
          ...(doc.meta as Record<string, unknown> | undefined),
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
            label: doc[breadcrumbLabelField] as string,
            path: rootPathForLocale(locale, routing),
          },
        ],
        meta: {
          ...(doc.meta as Record<string, unknown> | undefined),
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
