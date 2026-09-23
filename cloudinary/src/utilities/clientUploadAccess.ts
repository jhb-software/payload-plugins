import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { APIError, Forbidden, type PayloadRequest } from 'payload'

/**
 * By default a user may only use the client-upload endpoints if they are allowed to create
 * documents in the target upload collection. Falling back to mere authentication would let
 * any logged-in user sign or confirm uploads for collections they cannot upload to.
 */
const defaultAccess: ClientUploadsAccess = async ({ collectionSlug, req }) => {
  const createAccess = req.payload?.collections?.[collectionSlug]?.config?.access?.create
  if (!createAccess) {
    return !!req.user
  }
  return Boolean(await createAccess({ data: {}, req }))
}

/**
 * Resolves the `collectionSlug` search param and throws unless it names a collection this plugin
 * manages and the user passes the access check.
 */
export async function assertClientUploadAccess({
  access = defaultAccess,
  collections,
  req,
}: {
  access?: ClientUploadsAccess
  collections: string[]
  req: PayloadRequest
}): Promise<string> {
  const collectionSlug = req.searchParams.get('collectionSlug')

  if (!collectionSlug) {
    throw new APIError('No payload was provided')
  }

  // Otherwise the access check could be satisfied via any collection the user can create in,
  // even ones unrelated to client uploads.
  if (!collections.includes(collectionSlug)) {
    throw new Forbidden()
  }

  if (!(await access({ collectionSlug, req }))) {
    throw new Forbidden()
  }

  return collectionSlug
}

/** Strips leading and trailing slashes so folder values compare consistently. */
export const normalizeFolder = (value: string): string => {
  let start = 0
  let end = value.length
  while (start < end && value[start] === '/') {
    start++
  }
  while (end > start && value[end - 1] === '/') {
    end--
  }
  return value.slice(start, end)
}
