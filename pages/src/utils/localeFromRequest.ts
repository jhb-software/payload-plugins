import { Locale } from '../types/Locale.js'
import { PayloadRequest } from 'payload'

/** Returns the locale string (or undefined) from the PayloadRequest. */
export function localeFromRequest(req: PayloadRequest): Locale | 'all' | undefined {
  // When using the REST API, the locale query param can be set to undefined, in this case it is a string 'undefined'
  // In this case, convert it to an undefined value
  if (typeof req.locale === 'string' && req.locale === 'undefined') {
    return undefined
  }

  return req.locale as Locale | 'all' | undefined
}

/** Returns the locales from the request. */
export function localesFromRequest(req: PayloadRequest): Locale[] | undefined {
  if (typeof req?.payload.config.localization === 'object' && req?.payload.config.localization) {
    return req.payload.config.localization.localeCodes
  } else {
    return undefined
  }
}
