import type { Payload, PayloadRequest } from 'payload'

import { unstable_cache } from 'next/cache.js'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { createCachedAltTextHealthScan } from './altTextHealthCache.js'
import { localesFromConfig } from './localesFromConfig.js'
import { summarizeCollection } from './summarizeCollection.js'

export const ALT_TEXT_HEALTH_PLUGIN_SLUG = 'alt-text'
export const ALT_TEXT_HEALTH_CACHE_TTL = 3600
export const ALT_TEXT_HEALTH_GLOBAL_TAG = 'alt-text-health'

export type AltTextHealthErrorCode =
  | 'ALT_TEXT_COLLECTION_READ_FAILED'
  | 'ALT_TEXT_PLUGIN_CONFIG_MISSING'

export type AltTextHealthError = {
  code: AltTextHealthErrorCode
  collection?: string
  message: string
  operation?: 'find'
}

export type AltTextHealthScanCollection = {
  collection: string
  completeDocs: number
  error?: AltTextHealthError
  invalidDocIds: (number | string)[] | undefined
  missingDocs: number
  partialDocs: number
  totalDocs: number
}

export type AltTextHealthScan = {
  checkedAt: string
  collections: AltTextHealthScanCollection[]
  errors: AltTextHealthError[]
  isLocalized: boolean
  localeCodes: string[]
}

export type AltTextHealthWidgetData = {
  collections: AltTextHealthScanCollection[]
  errors: AltTextHealthError[]
  isLocalized: boolean
  localeCount: number
  totalDocs: number
}

type AltTextHealthComputationArgs = {
  collections: string[]
  isLocalized: boolean
  localeCodes: string[]
  payload: Payload
}

const createUnknownScan = ({
  error,
  isLocalized,
  localeCodes,
}: {
  error: AltTextHealthScan['errors'][number]
  isLocalized: boolean
  localeCodes: string[]
}): AltTextHealthScan => ({
  checkedAt: new Date().toISOString(),
  collections: [],
  errors: [error],
  isLocalized,
  localeCodes,
})

const createCollectionReadError = (collection: string, message: string) => ({
  code: 'ALT_TEXT_COLLECTION_READ_FAILED' as const,
  collection,
  message,
  operation: 'find' as const,
})

const PAGE_SIZE = 500

async function fetchAllDocs(
  payload: Payload,
  collection: string,
  isLocalized: boolean,
): Promise<{ alt: unknown; id: number | string }[]> {
  const docs: { alt: unknown; id: number | string }[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await payload.find({
      collection,
      depth: 0,
      fallbackLocale: isLocalized ? false : undefined,
      limit: PAGE_SIZE,
      locale: isLocalized ? 'all' : undefined,
      overrideAccess: true,
      page,
      select: {
        alt: true,
      },
    })

    for (const doc of result.docs) {
      docs.push({
        id: doc.id,
        alt: 'alt' in doc ? doc.alt : undefined,
      })
    }

    hasMore = result.hasNextPage
    page++
  }

  return docs
}

async function computeAltTextHealthScan({
  collections,
  isLocalized,
  localeCodes,
  payload,
}: AltTextHealthComputationArgs): Promise<AltTextHealthScan> {
  const collectionSummaries = await Promise.all(
    collections.map(async (collection): Promise<AltTextHealthScanCollection> => {
      try {
        const docs = await fetchAllDocs(payload, collection, isLocalized)

        return summarizeCollection({
          collection,
          docs,
          isLocalized,
          localeCodes,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const collectionError = createCollectionReadError(collection, message)

        payload.logger.error({
          collection,
          err: error,
          msg: 'Alt text health check failed while reading a collection.',
          operation: 'find',
          plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
        })

        return {
          collection,
          completeDocs: 0,
          error: collectionError,
          invalidDocIds: undefined,
          missingDocs: 0,
          partialDocs: 0,
          totalDocs: 0,
        }
      }
    }),
  )

  const errors = collectionSummaries
    .filter((summary) => summary.error)
    .map((summary) => summary.error!)

  return {
    checkedAt: new Date().toISOString(),
    collections: collectionSummaries,
    errors,
    isLocalized,
    localeCodes,
  }
}

export const getAltTextHealthCollectionTag = (collectionSlug: string): string =>
  `${ALT_TEXT_HEALTH_GLOBAL_TAG}:${collectionSlug}`

async function getAltTextHealthScan(req: PayloadRequest): Promise<AltTextHealthScan> {
  const { payload } = req
  const pluginConfig = payload.config.custom?.altTextPluginConfig as AltTextPluginConfig | undefined
  const localeCodes =
    localesFromConfig(payload.config) ?? (pluginConfig?.locale ? [pluginConfig.locale] : [])
  const isLocalized = Boolean(payload.config.localization)

  if (!pluginConfig) {
    return createUnknownScan({
      error: {
        code: 'ALT_TEXT_PLUGIN_CONFIG_MISSING',
        message: 'Alt text plugin config not found',
      },
      isLocalized,
      localeCodes,
    })
  }

  const collections = pluginConfig.collections

  const cacheKeyParts = [
    ALT_TEXT_HEALTH_GLOBAL_TAG,
    [...collections].sort().join(','),
    localeCodes.join(','),
  ]

  const tags = [
    ALT_TEXT_HEALTH_GLOBAL_TAG,
    ...new Set(collections.map((collection) => getAltTextHealthCollectionTag(collection))),
  ]

  const getCachedHealthScan = createCachedAltTextHealthScan({
    cacheFactory: unstable_cache,
    cacheKeyParts,
    compute: async () =>
      computeAltTextHealthScan({
        collections,
        isLocalized,
        localeCodes,
        payload,
      }),
    revalidate: ALT_TEXT_HEALTH_CACHE_TTL,
    tags,
  })

  return getCachedHealthScan()
}

export async function getAltTextHealth(req: PayloadRequest): Promise<AltTextHealthScan> {
  return getAltTextHealthScan(req)
}

export async function getAltTextHealthWidgetData(
  req: PayloadRequest,
): Promise<AltTextHealthWidgetData> {
  const scan = await getAltTextHealthScan(req)

  return {
    collections: scan.collections,
    errors: scan.errors,
    isLocalized: scan.isLocalized,
    localeCount: scan.localeCodes.length,
    totalDocs: scan.collections.reduce((total, c) => total + c.totalDocs, 0),
  }
}
