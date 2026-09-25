import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'

import { APIError, Forbidden, type PayloadRequest } from 'payload'
import { assertClientUploadAccess as assertCollectionWriteAccess } from 'payload/internal'

/** Matches the official storage adapters: the custom rule only narrows core's baseline check. */
const defaultAccess: ClientUploadsAccess = ({ req }) => !!req.user

/**
 * Resolves the `collectionSlug` search param and throws unless it names a collection this plugin
 * manages, the user may create or update documents in it (core's baseline, which also requires
 * authentication), and the user passes the plugin's `clientUploads.access` rule.
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
    throw new APIError('No collectionSlug was provided.', 400)
  }

  // Otherwise the access check could be satisfied via any collection the user can write to,
  // even ones unrelated to client uploads.
  if (!collections.includes(collectionSlug)) {
    throw new Forbidden()
  }

  await assertCollectionWriteAccess({ collectionSlug, req })

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
