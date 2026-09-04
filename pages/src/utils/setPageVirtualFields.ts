import type { PayloadRequest } from 'payload'

import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'

import { type Collection, isPublishedInLocale } from '../queries/liveness.js'
import { alternatePathsFor } from './alternatePaths.js'
import { getBreadcrumbs } from './getBreadcrumbs.js'
import { localePrefixMap } from './localePrefix.js'

/** Sets the virtual fields (breadcrumbs, path, alternatePaths) of the given page document. */
export async function setPageDocumentVirtualFields({
  collection,
  doc,
  draft,
  includeDraftLocales = false,
  locale,
  locales,
  pageConfigAttributes,
  req,
  routing,
}: {
  /** The collection `doc` belongs to; decides whether `_status` is judged per locale. */
  collection: Collection
  doc: Record<string, unknown>
  /** Whether the ancestors the paths are built from resolve to their latest version. */
  draft: boolean
  /** Whether paths should include locales that only have a draft, regardless of publish state. */
  includeDraftLocales?: boolean
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
      // Localized pages need the breadcrumbs of every locale to build the alternate paths
      locale: 'all',
    })) as Record<Locale, Breadcrumb[]>

    const paths: Record<Locale, string> = locales.reduce(
      (acc, localeCode) => {
        // A published read must not expose a draft-only locale (localized `_status`) as a
        // navigable or alternate path. Draft reads keep such paths for the preview being rendered.
        // `afterChange` receives the slug flattened to its one requested locale. That value must
        // not stand in for the other locales, whose slugs may differ.
        const hasSlug =
          (doc.slug &&
            typeof doc.slug === 'object' &&
            (doc.slug as Record<string, unknown>)[localeCode]) ||
          (typeof doc.slug === 'string' && doc.slug && (locale === 'all' || locale === localeCode))

        if (
          hasSlug &&
          (includeDraftLocales || draft || isPublishedInLocale(doc, collection, localeCode))
        ) {
          acc[localeCode] = breadcrumbs[localeCode].at(-1)!.path
        }
        return acc
      },
      {} as Record<Locale, string>,
    )

    const alternatePaths = alternatePathsFor(paths, routing)

    if (locale === 'all') {
      // Breadcrumbs follow `path`: a locale without a path gets no trail either, so Payload's
      // locale fallback treats both fields alike on a single-locale read.
      const liveBreadcrumbs = Object.fromEntries(
        Object.keys(paths).map((localeCode) => [localeCode, breadcrumbs[localeCode]]),
      ) as Record<Locale, Breadcrumb[]>

      return {
        ...doc,
        breadcrumbs: liveBreadcrumbs,
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
        breadcrumbs: paths[locale] ? breadcrumbs[locale] : undefined,
        meta: {
          ...(doc.meta as Record<string, unknown> | undefined),
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
