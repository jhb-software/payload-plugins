/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { Payload, PayloadRequest } from 'payload'

import type { Locale } from '../types/Locale.js'

/** Returns the locale string (or undefined) from the PayloadRequest. */
export function localeFromRequest(req: PayloadRequest): 'all' | Locale | undefined {
  // When using the REST API, the locale query param can be set to undefined, in this case it is a string 'undefined'
  // In this case, convert it to an undefined value
  if (typeof req.locale === 'string' && req.locale === 'undefined') {
    return undefined
  }

  return req.locale as 'all' | Locale | undefined
}

/** Returns the configured locale codes, or undefined on an unlocalized install. */
export function localeCodesOf(payload: Payload): Locale[] | undefined {
  const localization = payload.config.localization
  return localization ? localization.localeCodes : undefined
}

/** Returns the locales from the request. */
export function localesFromRequest(req: PayloadRequest): Locale[] | undefined {
  return req?.payload ? localeCodesOf(req.payload) : undefined
}
