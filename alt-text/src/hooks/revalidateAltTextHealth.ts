import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { revalidateTag } from 'next/cache.js'

import {
  ALT_TEXT_HEALTH_PLUGIN_SLUG,
  getAltTextHealthCollectionTag,
} from '../utilities/altTextHealth.js'

function safeRevalidateTag(req: PayloadRequest, tag: string): void {
  try {
    // Support both Next 15 and Next 16. Next 15 types `revalidateTag(tag)` as 1-arg; Next 16
    // added a required second `profile` arg (a 1-arg call still works at runtime, with a
    // deprecation warning). Cast so the build succeeds regardless of which Next types are
    // resolved, while keeping runtime behaviour correct on both versions.
    ;(revalidateTag as (tag: string) => void)(tag)
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
