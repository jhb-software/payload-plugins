import type { CollectionBeforeValidateHook } from 'payload'

import type { SanitizedRedirectsCollectionConfigAttributes } from '../types/RedirectsCollectionConfigAttributes.js'

import { AdminPanelError } from '../utils/AdminPanelError.js'

// TODO: use a unique index on the sourcePath field to improve performance (ensure it can be disabled for the multi-tenant setups)

/** Hook which validates the redirect data before it is saved to ensure that no infinite redirect loops are created. */
export const validateRedirect: CollectionBeforeValidateHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  // When the fields of a redirect are edited via the local API, the sourcePath and destinationPath fields might be undefined,
  // therefore fallback to the originalDoc values in this case.
  const sourcePath = data?.sourcePath ?? originalDoc?.sourcePath
  const destinationPath = data?.destinationPath ?? originalDoc?.destinationPath

  // Get redirectValidationFilter from sanitized redirects config
  const pagesPlugin = collection?.custom?.pagesPlugin as
    | { _redirects?: SanitizedRedirectsCollectionConfigAttributes }
    | undefined
  const sanitizedConfig = pagesPlugin?._redirects
  const redirectValidationFilter =
    typeof sanitizedConfig?.redirectValidationFilter === 'function'
      ? sanitizedConfig.redirectValidationFilter({ doc: data, req })
      : undefined

  // Check if there's already a redirect for the source path
  const existingRedirect = await req.payload.count({
    collection: 'redirects',
    where: {
      and: [
        { sourcePath: { equals: sourcePath } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []), // exclude the current redirect if editing
        ...(redirectValidationFilter ? [redirectValidationFilter] : []),
      ],
    },
  })

  if (existingRedirect.totalDocs > 0) {
    throw new AdminPanelError('A redirect for this source path already exists.', 409)
  }

  // Check for opposite redirects which would create a redirect loop: a redirect that goes from our destination back to our source
  const oppositeRedirect = await req.payload.count({
    collection: 'redirects',
    where: {
      and: [
        { sourcePath: { equals: destinationPath } },
        { destinationPath: { equals: sourcePath } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []), // exclude the current redirect if editing
        ...(redirectValidationFilter ? [redirectValidationFilter] : []),
      ],
    },
  })

  if (oppositeRedirect.totalDocs > 0) {
    throw new AdminPanelError(
      'A redirect in the opposite direction already exists. Therefore this redirect would create an infinite redirect loop.',
      409,
    )
  }

  // Check for opposite redirects which would create a redirect loop: a redirect that goes from our destination back to our source
  const oppositeTransitiveRedirects = await req.payload.count({
    collection: 'redirects',
    where: {
      and: [
        {
          // NOTE: To also account for transitive redirects, check both directions separately using the "or" clause
          or: [
            { sourcePath: { equals: destinationPath } },
            { destinationPath: { equals: sourcePath } },
          ],
        },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []), // exclude the current redirect if editing
        ...(redirectValidationFilter ? [redirectValidationFilter] : []),
      ],
    },
  })

  // because of the "or" clause, we need to check if the totalDocs is >= 2 instead of > 0
  if (oppositeTransitiveRedirects.totalDocs >= 2) {
    throw new AdminPanelError(
      'A transitive redirect in the opposite direction already exists. Therefore this redirect would create an infinite redirect loop.',
      409,
    )
  }

  return data
}
