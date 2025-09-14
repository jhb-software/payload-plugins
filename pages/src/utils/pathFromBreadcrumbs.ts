import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'

/** Converts the given breadcrumbs and the locale to a path */
export function pathFromBreadcrumbs({
  locale,
  breadcrumbs,
  additionalSlug,
  pathPrefix,
}: {
  locale: Locale | undefined
  breadcrumbs: Breadcrumb[]
  additionalSlug?: string
  pathPrefix?: string
}): string {
  const computedPath = [
    locale ? `/${locale}` : '',
    ...[...breadcrumbs.map(({ slug }) => slug), additionalSlug].filter(Boolean),
  ].join('/')

  if (pathPrefix) {
    // Normalize prefix: remove trailing slashes, ensure leading slash
    const normalizedPrefix = pathPrefix.replace(/\/+$/, '')
    const prefix = normalizedPrefix.startsWith('/') ? normalizedPrefix : `/${normalizedPrefix}`
    
    return computedPath === '' ? prefix : `${prefix}${computedPath}`
  }

  return computedPath
}
