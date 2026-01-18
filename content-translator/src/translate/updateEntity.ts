import type { CollectionSlug, PayloadRequest, TypeWithID } from 'payload'

import { APIError } from 'payload'

type Args = {
  collectionSlug?: string
  data: Record<string, any>
  depth?: number
  globalSlug?: string
  id?: number | string
  locale: string
  overrideAccess?: boolean
  req: PayloadRequest
}

export const updateEntity = ({
  id,
  collectionSlug,
  data,
  depth: incomingDepth,
  globalSlug,
  locale,
  overrideAccess,
  req,
}: Args): Promise<Record<string, unknown> & TypeWithID> => {
  if (!collectionSlug && !globalSlug) {
    throw new APIError('Bad Request', 400)
  }

  const isGlobal = !!globalSlug

  if (!isGlobal && !id) {
    throw new APIError('Bad Request', 400)
  }

  const depth = incomingDepth ?? req.payload.config.defaultDepth

  const promise = isGlobal
    ? req.payload.updateGlobal({
        slug: globalSlug,
        data,
        depth,
        locale: locale as any,
        overrideAccess,
        req,
      })
    : req.payload.update({
        id: id as number | string,
        collection: collectionSlug as CollectionSlug,
        data,
        depth,
        locale: locale as any,
        overrideAccess,
        req,
      })

  return promise as any
}
