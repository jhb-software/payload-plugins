import type { Payload, PayloadRequest } from 'payload'

import { unstable_cache } from 'next/cache.js'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { localesFromConfig } from './localesFromConfig.js'

export const ALT_TEXT_HEALTH_CACHE_TTL = 300
export const ALT_TEXT_HEALTH_GLOBAL_TAG = 'alt-text-health'

type AltTextHealthCollectionError = {
  collection: string
  message: string
}

export type AltTextHealthCollectionSummary = {
  collection: string
  completeDocs: number
  error?: string
  missingDocs: number
  partialDocs: number
  totalDocs: number
}

export type AltTextHealthSummary = {
  collections: AltTextHealthCollectionSummary[]
  completeDocs: number
  errors: AltTextHealthCollectionError[]
  isLocalized: boolean
  localeCodes: string[]
  missingDocs: number
  partialDocs: number
  totalDocs: number
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
  localeCodes,
}: {
  errors?: AltTextHealthCollectionError[]
  isLocalized: boolean
  localeCodes: string[]
}): AltTextHealthSummary => ({
  collections: [],
  completeDocs: 0,
  errors,
  isLocalized,
  localeCodes,
  missingDocs: 0,
  partialDocs: 0,
  totalDocs: 0,
})

const countFilledLocales = (altValue: unknown, localeCodes: string[]): number => {
  if (!isRecord(altValue)) {
    return 0
  }

  return localeCodes.filter((localeCode) => hasAltValue(altValue[localeCode])).length
}

const summarizeCollection = ({
  altValues,
  collection,
  isLocalized,
  localeCodes,
}: {
  altValues: unknown[]
  collection: string
  isLocalized: boolean
  localeCodes: string[]
}): AltTextHealthCollectionSummary => {
  let completeDocs = 0
  let missingDocs = 0
  let partialDocs = 0

  for (const altValue of altValues) {
    if (!isLocalized) {
      if (hasAltValue(altValue)) {
        completeDocs++
      } else {
        missingDocs++
      }

      continue
    }

    const filledLocales = countFilledLocales(altValue, localeCodes)

    if (filledLocales === 0) {
      missingDocs++
    } else if (filledLocales === localeCodes.length) {
      completeDocs++
    } else {
      partialDocs++
    }
  }

  return {
    collection,
    completeDocs,
    missingDocs,
    partialDocs,
    totalDocs: altValues.length,
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

        const altValues = result.docs.map((doc) => ('alt' in doc ? doc.alt : undefined))

        return summarizeCollection({
          altValues,
          collection,
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

  const summary = createEmptySummary({ errors, isLocalized, localeCodes })

  for (const collectionSummary of collectionSummaries) {
    summary.collections.push(collectionSummary)
    summary.completeDocs += collectionSummary.completeDocs
    summary.missingDocs += collectionSummary.missingDocs
    summary.partialDocs += collectionSummary.partialDocs
    summary.totalDocs += collectionSummary.totalDocs
  }

  return summary
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
        localeCodes,
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
