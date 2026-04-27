import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidateTag } from 'next/cache.js'
import { after } from 'next/server.js'

import type { RevalidateAltTextHealthDeps } from './revalidateAltTextHealth.core.js'

import { getAltTextHealthCollectionTag } from '../utilities/altTextHealthTags.js'
import {
  createRevalidateAltTextHealthAfterChangeHookWithDeps,
  createRevalidateAltTextHealthAfterDeleteHookWithDeps,
} from './revalidateAltTextHealth.core.js'

const defaultDeps: RevalidateAltTextHealthDeps = {
  after,
  // Cast to support both Next 15 and Next 16. Next 15 types `revalidateTag(tag)`
  // as 1-arg; Next 16 added a required second `profile` arg (a 1-arg call still
  // works at runtime, with a deprecation warning).
  revalidateTag: revalidateTag as (tag: string) => void,
}

export const createRevalidateAltTextHealthAfterChangeHook = (
  collectionSlug: string,
): CollectionAfterChangeHook =>
  createRevalidateAltTextHealthAfterChangeHookWithDeps(
    getAltTextHealthCollectionTag(collectionSlug),
    defaultDeps,
  )

export const createRevalidateAltTextHealthAfterDeleteHook = (
  collectionSlug: string,
): CollectionAfterDeleteHook =>
  createRevalidateAltTextHealthAfterDeleteHookWithDeps(
    getAltTextHealthCollectionTag(collectionSlug),
    defaultDeps,
  )
