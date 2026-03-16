import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { revalidateTag } from 'next/cache.js'

import {
  ALT_TEXT_HEALTH_GLOBAL_TAG,
  getAltTextHealthCollectionTag,
} from '../utilities/altTextHealth.js'

function safeRevalidateTag(req: PayloadRequest, tag: string): void {
  try {
    revalidateTag(tag)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('static generation store missing')) {
      req.payload.logger.warn(
        `Skipping alt text health cache revalidation for "${tag}" outside a Next.js request context.`,
      )
      return
    }

    throw error
  }
}

export const createRevalidateAltTextHealthAfterChangeHook =
  (collectionSlug: string): CollectionAfterChangeHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateTag(req, ALT_TEXT_HEALTH_GLOBAL_TAG)
      safeRevalidateTag(req, getAltTextHealthCollectionTag(collectionSlug))
    }

    return doc
  }

export const createRevalidateAltTextHealthAfterDeleteHook =
  (collectionSlug: string): CollectionAfterDeleteHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateTag(req, ALT_TEXT_HEALTH_GLOBAL_TAG)
      safeRevalidateTag(req, getAltTextHealthCollectionTag(collectionSlug))
    }

    return doc
  }
