import type { Breadcrumb } from '../types/Breadcrumb.js'
import type { Locale } from '../types/Locale.js'

import { prefixForLocale } from './localeRouting.js'

/** Converts the given breadcrumbs and the locale to a path */
export function pathFromBreadcrumbs({
  additionalSlug,
  breadcrumbs,
  locale,
  localePrefixes,
}: {
  additionalSlug?: string
  breadcrumbs: Breadcrumb[]
  locale: Locale | undefined
  /** Each locale's path prefix. Without it every locale is prefixed with `/<locale>`. */
  localePrefixes?: Record<Locale, string>
}): string {
  return [
    prefixForLocale(localePrefixes, locale),
    ...[...breadcrumbs.map(({ slug }) => slug), additionalSlug].filter(Boolean),
  ].join('/')
}
