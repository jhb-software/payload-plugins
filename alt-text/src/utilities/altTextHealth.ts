import type { Payload, PayloadRequest } from 'payload'

import { unstable_cache } from 'next/cache.js'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { localesFromConfig } from './localesFromConfig.js'

export const ALT_TEXT_HEALTH_CACHE_TTL = 3600
export const ALT_TEXT_HEALTH_GLOBAL_TAG = 'alt-text-health'

type AltTextHealthCollectionError = {
  collection: string
  message: string
}

export type AltTextHealthCollectionSummary = {
  collection: string
  completeDocs: number
  error?: string
  invalidDocIds: (number | string)[]
  missingDocs: number
  partialDocs: number
  totalDocs: number
}

export type AltTextHealthSummary = {
  collections: AltTextHealthCollectionSummary[]
  errors: AltTextHealthCollectionError[]
  isLocalized: boolean
}

type AltTextHealthComputationArgs = {
  collections: string[]
  isLocalized: boolean
  localeCodes: string[]
  payload: Payload
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasAltValue = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0

const createEmptySummary = ({
  errors = [],
  isLocalized,
}: {
  errors?: AltTextHealthCollectionError[]
  isLocalized: boolean
}): AltTextHealthSummary => ({
  collections: [],
  errors,
  isLocalized,
})

const countFilledLocales = (altValue: unknown, localeCodes: string[]): number => {
  if (!isRecord(altValue)) {
    return 0
  }

  return localeCodes.filter((localeCode) => hasAltValue(altValue[localeCode])).length
}

const summarizeCollection = ({
  collection,
  docs,
  isLocalized,
  localeCodes,
}: {
  collection: string
  docs: { alt: unknown; id: number | string }[]
  isLocalized: boolean
  localeCodes: string[]
}): AltTextHealthCollectionSummary => {
  let completeDocs = 0
  let missingDocs = 0
  let partialDocs = 0
  const invalidDocIds: (number | string)[] = []

  for (const doc of docs) {
    if (!isLocalized) {
      if (hasAltValue(doc.alt)) {
        completeDocs++
      } else {
        missingDocs++
        invalidDocIds.push(doc.id)
      }

      continue
    }

    const filledLocales = countFilledLocales(doc.alt, localeCodes)

    if (filledLocales === localeCodes.length) {
      completeDocs++
    } else if (filledLocales === 0) {
      missingDocs++
      invalidDocIds.push(doc.id)
    } else {
      partialDocs++
      invalidDocIds.push(doc.id)
    }
  }

  return {
    collection,
    completeDocs,
    invalidDocIds,
    missingDocs,
    partialDocs,
    totalDocs: docs.length,
  }
}

async function computeAltTextHealth({
  collections,
  isLocalized,
  localeCodes,
  payload,
}: AltTextHealthComputationArgs): Promise<AltTextHealthSummary> {
  const collectionSummaries = await Promise.all(
    collections.map(async (collection): Promise<AltTextHealthCollectionSummary> => {
      try {
        const result = await payload.find({
          collection,
          depth: 0,
          fallbackLocale: isLocalized ? false : undefined,
          locale: isLocalized ? 'all' : undefined,
          overrideAccess: true,
          pagination: false,
          select: {
            alt: true,
          },
        })

        const docs = result.docs.map((doc) => ({
          alt: 'alt' in doc ? doc.alt : undefined,
          id: doc.id,
        }))

        return summarizeCollection({
          collection,
          docs,
          isLocalized,
          localeCodes,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        payload.logger.error(`Alt text health check failed for "${collection}": ${message}`)

        return {
          collection,
          completeDocs: 0,
          error: message,
          invalidDocIds: [],
          missingDocs: 0,
          partialDocs: 0,
          totalDocs: 0,
        }
      }
    }),
  )

  const errors = collectionSummaries
    .filter((summary) => typeof summary.error === 'string')
    .map((summary) => ({
      collection: summary.collection,
      message: summary.error!,
    }))

  return {
    collections: collectionSummaries,
    errors,
    isLocalized,
  }
}

export const getAltTextHealthCollectionTag = (collectionSlug: string): string =>
  `${ALT_TEXT_HEALTH_GLOBAL_TAG}:${collectionSlug}`

export function getAltTextHealth(req: PayloadRequest): Promise<AltTextHealthSummary> {
  const { payload } = req
  const pluginConfig = payload.config.custom?.altTextPluginConfig as AltTextPluginConfig | undefined
  const localeCodes = localesFromConfig(payload.config) ?? (pluginConfig?.locale ? [pluginConfig.locale] : [])
  const isLocalized = Boolean(payload.config.localization)

  if (!pluginConfig) {
    return Promise.resolve(
      createEmptySummary({
        errors: [
          {
            collection: 'plugin',
            message: 'Alt text plugin config not found',
          },
        ],
        isLocalized,
      }),
    )
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

  const getCachedHealth = unstable_cache(
    async () =>
      computeAltTextHealth({
        collections,
        isLocalized,
        localeCodes,
        payload,
      }),
    cacheKeyParts,
    {
      revalidate: ALT_TEXT_HEALTH_CACHE_TTL,
      tags,
    },
  )

  return getCachedHealth()
}
