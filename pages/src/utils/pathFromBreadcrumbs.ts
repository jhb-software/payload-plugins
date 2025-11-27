import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'

/** Converts the given breadcrumbs and the locale to a path */
export function pathFromBreadcrumbs({
  additionalSlug,
  breadcrumbs,
  locale,
}: {
  additionalSlug?: string
  breadcrumbs: Breadcrumb[]
  locale: Locale | undefined
}): string {
  return [
    locale ? `/${locale}` : '',
    ...[...breadcrumbs.map(({ slug }) => slug), additionalSlug].filter(Boolean),
  ].join('/')
}
