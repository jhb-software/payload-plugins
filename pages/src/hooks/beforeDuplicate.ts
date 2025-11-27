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
