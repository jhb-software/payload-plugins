import { hasLocalizeStatusEnabled } from 'payload/shared'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'

import { type Collection, isPublishedInLocale } from '../queries/liveness.js'
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
  collection,
  doc,
  draft,
  locale,
  locales,
  routing,
}: {
  breadcrumbLabelField: string
  /** The collection `doc` belongs to; decides whether `_status` is judged per locale. */
  collection: Collection
  doc: Record<string, unknown>
  /** Whether the operation resolves the latest version; a draft read keeps draft-only locales. */
  draft: boolean
  locale: Locale | undefined
  locales: Locale[] | undefined
  routing: LocaleRouting | undefined
}) {
  if (locales && locale) {
    // A root page has the constant `ROOT_PAGE_SLUG`, so it has a path in every live locale even
    // when that locale has never stored the empty slug. Draft reads include draft-only locales.
    const paths = locales.reduce(
      (acc, localeCode) => {
        // `afterChange` supplies a localized status flattened to its requested locale, which says
        // nothing about the other locales. Restrict its response to that locale instead of
        // treating the status as global. A plain `_status` covers every locale.
        const hasLocaleData =
          locale === 'all' || locale === localeCode || !hasLocalizeStatusEnabled(collection)
        if (hasLocaleData && (draft || isPublishedInLocale(doc, collection, localeCode))) {
          acc[localeCode] = rootPathForLocale(localeCode, routing)
        }
        return acc
      },
      {} as Record<Locale, string>,
    )

    const alternatePaths = alternatePathsFor(paths, routing)

    if (locale === 'all') {
      // Breadcrumbs follow `path`: a locale without a path gets no trail either.
      const breadcrumbs: Record<Locale, Breadcrumb[]> = Object.fromEntries(
        Object.entries(paths).map(([localeCode, path]) => [
          localeCode,
          [
            {
              slug: ROOT_PAGE_SLUG,
              label: (doc[breadcrumbLabelField] as Record<string, string>)[localeCode],
              path,
            },
          ],
        ]),
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
        // Breadcrumbs follow `path`: none without a path in the written locale.
        breadcrumbs: paths[locale]
          ? [
              {
                slug: ROOT_PAGE_SLUG,
                label: doc[breadcrumbLabelField] as string,
                path: paths[locale],
              },
            ]
          : undefined,
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
