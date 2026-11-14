import type { PayloadRequest } from 'payload'

import { isolateObjectProperty } from 'payload'

/**
 * Returns a view of `req` with its own `locale` and `fallbackLocale`, for queries in a locale the
 * caller did not choose. A Local API call writes its locale onto the `req` it is given and leaves
 * it there, which would switch every later or concurrent operation on the caller's request to it.
 * Everything else — transaction, user, context — is shared with `req`.
 */
export function isolateRequestLocale(req: PayloadRequest): PayloadRequest {
  return isolateObjectProperty(req, ['locale', 'fallbackLocale'])
}
