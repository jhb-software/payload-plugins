import { Breadcrumb } from '../types/Breadcrumb.js'
import { Locale } from '../types/Locale.js'
import { pathFromBreadcrumbs } from './pathFromBreadcrumbs.js'

/**
 * Validates the breadcrumbs and throws an error if invalid.
 */
export function validateBreadcrumbs(locale: Locale | undefined, breadcrumbs: Breadcrumb[], pathPrefix?: string) {
  if (!breadcrumbs) {
    throw new Error(locale ? 'No breadcrumbs found for locale ' + locale : 'No breadcrumbs found')
  }

  if (breadcrumbs.length === 0) {
    throw new Error(
      locale ? 'Empty breadcrumbs found for locale ' + locale : 'Empty breadcrumbs found',
    )
  }

  if (
    pathFromBreadcrumbs({ locale: locale, breadcrumbs: breadcrumbs, pathPrefix }) !== breadcrumbs.at(-1)?.path
  ) {
    throw new Error(
      `Path generated from breadcrumbs (${pathFromBreadcrumbs({
        locale: locale,
        breadcrumbs: breadcrumbs,
        pathPrefix,
      })}) is not equal to the path of the last breadcrumb: ${breadcrumbs.at(-1)?.path}`,
    )
  }
}
