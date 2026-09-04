import type { FieldHook } from 'payload'

import { ROOT_PAGE_SLUG } from '../utils/setRootPageVirtualFields.js'

/** Hooks which adjusts the slug to make sure the slug is still unique after duplication. */
export const beforeDuplicateSlug: FieldHook = ({ value }) => {
  if (value === ROOT_PAGE_SLUG) {
    return 'root-page-copy'
  }

  return value && typeof value === 'string' ? value + '-copy' : value
}

/** Hooks which adjusts the title to indicate this is a copy. */
export const beforeDuplicateTitle: FieldHook = ({ value }) => {
  return value && typeof value === 'string' ? value + ' (copy)' : value
}

/** Hook which ensures that if the root page is duplicated, the new page has not set isRootPage to true. */
export const beforeDuplicateIsRootPage: FieldHook = ({ value }) => {
  return typeof value === 'boolean' && value === true ? false : value
}

/**
 * Supplies the constant root page slug before validation.
 *
 * The admin hides the slug of a root page and nothing writes it, so a locale's first save — and
 * any API write which omits the slug — reaches the required-field validation without a value in
 * that locale. Payload's locale fallback does not help either: the fallback value is the empty
 * string, which it treats as absent.
 */
export const rootPageSlugBeforeValidate: FieldHook = ({ data, originalDoc, value }) => {
  const isRootPage = data?.isRootPage ?? originalDoc?.isRootPage
  return isRootPage === true ? ROOT_PAGE_SLUG : value
}
