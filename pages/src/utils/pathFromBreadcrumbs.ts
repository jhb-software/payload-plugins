import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'

/** Converts the given breadcrumbs and the locale to a path */
export function pathFromBreadcrumbs({
  locale,
  breadcrumbs,
  additionalSlug,
}: {
  locale: Locale | undefined
  breadcrumbs: Breadcrumb[]
  additionalSlug?: string
}): string {
  return [
    locale ? `/${locale}` : '',
    ...[...breadcrumbs.map(({ slug }) => slug), additionalSlug].filter(Boolean),
  ].join('/')
}
