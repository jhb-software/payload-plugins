import { Locale } from '../types/Locale.js'

/** Validates the path and throws an error if invalid. */
export function validatePath(path: string, docId: string, locale: Locale | undefined) {
  // If the document has a parent which slug is not set for the requesting locale, the path of the document will be undefined.
  // Do not throw an error in this case, because then the document could not be edited in the admin UI.
  if (!path) {
    console.warn('Path for doc', docId, 'in locale', locale, 'undefined.')
    return
  }

  if (
    path.includes('undefined') ||
    path.includes('null') ||
    path.includes('[object Object]') ||
    !path.startsWith('/') ||
    path.includes('//') ||
    (path.length > 1 && path.endsWith('/'))
  ) {
    throw new Error('Path for doc ' + docId + ' in locale ' + locale + ' is not valid: ' + path)
  }
}
