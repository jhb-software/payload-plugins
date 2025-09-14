import { PayloadRequest } from 'payload'
import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'
import { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import { SeoMetadata } from '../types/SeoMetadata.js'
import { getBreadcrumbs } from './getBreadcrumbs.js'
import { validateBreadcrumbs } from './validateBreadcrumbs.js'
import { validatePath } from './validatePath.js'

/** Sets the virtual fields (breadcrumbs, path, alternatePaths) of the given root page document. */
export async function setPageDocumentVirtualFields({
  req,
  doc,
  locale,
  locales,
  pageConfigAttributes,
}: {
  req: PayloadRequest | undefined
  doc: Record<string, any>
  locale: Locale | 'all' | undefined
  locales: Locale[] | undefined
  pageConfigAttributes: PageCollectionConfigAttributes
}) {
  if (locales && locale) {
    const breadcrumbs = (await getBreadcrumbs({
      req,
      locales: locales,
      breadcrumbLabelField: pageConfigAttributes.breadcrumbs.labelField,
      parentField: pageConfigAttributes.parent.name,
      parentCollection: pageConfigAttributes.parent.collection,
      data: doc,
      // For localized pages, we need to fetch the breadcrumbs for all locales in order to correctly set the alternate paths
      locale: 'all',
      pathPrefix: pageConfigAttributes.path?.pathPrefix,
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
        hreflang: locale as Locale,
        path,
      }),
    )

    if (locale === 'all') {
      // TODO: remove these validations in favor of more unit tests?
      Object.entries(paths).forEach(([_, path]) => validatePath(path, doc.id, 'all'))
      Object.entries(paths).forEach(([locale, _]) =>
        validateBreadcrumbs(locale as Locale, breadcrumbs[locale as Locale], pageConfigAttributes.path?.pathPrefix),
      )

      return {
        ...doc,
        path: paths,
        breadcrumbs,
        meta: {
          ...doc.meta,
          alternatePaths,
        },
      }
    } else {
      // TODO: remove these validations in favor of more unit tests?
      validatePath(paths[locale], doc.id, locale)
      validateBreadcrumbs(locale, breadcrumbs[locale], pageConfigAttributes.path?.pathPrefix)

      return {
        ...doc,
        path: paths[locale],
        breadcrumbs: breadcrumbs[locale],
        meta: {
          ...doc.meta,
          alternatePaths,
        },
      }
    }
  } else {
    const breadcrumbs = (await getBreadcrumbs({
      req,
      locales: locales,
      breadcrumbLabelField: pageConfigAttributes.breadcrumbs.labelField,
      parentField: pageConfigAttributes.parent.name,
      parentCollection: pageConfigAttributes.parent.collection,
      data: doc,
      locale: undefined,
      pathPrefix: pageConfigAttributes.path?.pathPrefix,
    })) as Breadcrumb[]

    // TODO: remove these validations in favor of more unit tests?
    validatePath(breadcrumbs.at(-1)!.path, doc.id, locale)
    validateBreadcrumbs(locale, breadcrumbs, pageConfigAttributes.path?.pathPrefix)

    return {
      ...doc,
      path: breadcrumbs.at(-1)!.path,
      breadcrumbs: breadcrumbs,
    }
  }
}
