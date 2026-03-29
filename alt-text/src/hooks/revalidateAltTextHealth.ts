import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { revalidateTag } from 'next/cache.js'

import { getAltTextHealthCollectionTag } from '../utilities/altTextHealth.js'
import { ALT_TEXT_HEALTH_PLUGIN_SLUG } from '../utilities/altTextHealthContract.js'

function safeRevalidateTag(req: PayloadRequest, tag: string): void {
  try {
    revalidateTag(tag)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('static generation store missing')) {
      req.payload.logger.warn({
        msg: 'Skipping alt text health cache revalidation outside a Next.js request context.',
        plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
        tag,
      })
      return
    }

    throw error
  }
}

export const createRevalidateAltTextHealthAfterChangeHook =
  (collectionSlug: string): CollectionAfterChangeHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateTag(req, getAltTextHealthCollectionTag(collectionSlug))
    }

    return doc
  }

export const createRevalidateAltTextHealthAfterDeleteHook =
  (collectionSlug: string): CollectionAfterDeleteHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateTag(req, getAltTextHealthCollectionTag(collectionSlug))
    }

    return doc
  }
