import type { PayloadRequest, Where } from 'payload'

import { unstable_cache } from 'next/cache.js'
import { createLocalReq } from 'payload'

import type {
  AltTextPluginConfig,
  NormalizedAltTextCollectionConfig,
} from '../types/AltTextPluginConfig.js'
import type { AltTextHealthCacheFactory } from './altTextHealthCache.js'

import { createCachedAltTextHealthScan } from './altTextHealthCache.js'
import { localesFromConfig } from './localesFromConfig.js'
import { buildMimeTypeWhere } from './mimeTypes.js'
import { configuredLocales, resolveLocales } from './resolveLocales.js'
import { stableStringify } from './stableStringify.js'
import { summarizeCollection } from './summarizeCollection.js'

export const ALT_TEXT_HEALTH_PLUGIN_SLUG = 'alt-text'
export const ALT_TEXT_HEALTH_CACHE_TTL = 3600
export const ALT_TEXT_HEALTH_GLOBAL_TAG = 'alt-text-health'

export type AltTextHealthErrorCode =
  | 'ALT_TEXT_BASE_FILTER_FAILED'
  | 'ALT_TEXT_COLLECTION_READ_FAILED'
  | 'ALT_TEXT_LOCALES_FILTER_FAILED'
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
  /** The resolved base filter per collection slug, if one is configured. */
  baseFilters: Record<string, undefined | Where>
  collections: NormalizedAltTextCollectionConfig[]
  isLocalized: boolean
  localeCodes: string[]
  req: PayloadRequest
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

const isEmptyWhere = (where: undefined | Where): boolean =>
  !where || Object.keys(where).length === 0

async function fetchAllDocs(
  req: PayloadRequest,
  collection: string,
  isLocalized: boolean,
  mimeTypes: readonly string[],
  baseFilter: undefined | Where,
): Promise<{ alt: unknown; id: number | string }[]> {
  const mimeTypeWhere = buildMimeTypeWhere(mimeTypes)
  if (!mimeTypeWhere) {
    return []
  }

  const where = isEmptyWhere(baseFilter) ? mimeTypeWhere : { and: [mimeTypeWhere, baseFilter!] }

  const docs: { alt: unknown; id: number | string }[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    // Runs as the requesting user so Payload applies the collection's `read`
    // access at row level: a tenant-scoped rule narrows the aggregate to that
    // tenant without any plugin configuration.
    const result = await req.payload.find({
      collection,
      depth: 0,
      fallbackLocale: isLocalized ? false : undefined,
      limit: PAGE_SIZE,
      locale: isLocalized ? 'all' : undefined,
      overrideAccess: false,
      page,
      req,
      select: {
        alt: true,
      },
      where,
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
  baseFilters,
  collections,
  isLocalized,
  localeCodes,
  req,
}: AltTextHealthComputationArgs): Promise<AltTextHealthScan> {
  const { payload } = req

  const collectionSummaries = await Promise.all(
    collections.map(async ({ slug, mimeTypes }): Promise<AltTextHealthScanCollection> => {
      try {
        const docs = await fetchAllDocs(req, slug, isLocalized, mimeTypes, baseFilters[slug])

        return summarizeCollection({
          collection: slug,
          docs,
          isLocalized,
          localeCodes,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const collectionError = createCollectionReadError(slug, message)

        payload.logger.error({
          collection: slug,
          err: error,
          msg: 'Alt text health check failed while reading a collection.',
          operation: 'find',
          plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
        })

        return {
          collection: slug,
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

/**
 * Resolves the configured base filter for every scanned collection.
 *
 * A throwing filter (a tenant cookie pointing at a deleted tenant, say) must not
 * take the dashboard down, and must never fall back to an unfiltered scan — so it
 * ends the scan with an error the widget and the endpoint report. The error carries
 * the slug in its message rather than in `collection`, so it reads as a config
 * problem rather than as a failed read of that collection.
 */
async function resolveBaseFilters(
  req: PayloadRequest,
  collections: NormalizedAltTextCollectionConfig[],
  baseFilter: AltTextPluginConfig['healthCheckBaseFilter'],
): Promise<{ baseFilters: Record<string, undefined | Where> } | { error: AltTextHealthError }> {
  const baseFilters: Record<string, undefined | Where> = {}

  if (!baseFilter) {
    return { baseFilters }
  }

  for (const { slug } of collections) {
    try {
      baseFilters[slug] = await baseFilter({ collection: slug, req })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      req.payload.logger.error({
        collection: slug,
        err: error,
        msg: 'Alt text health check failed while resolving the base filter.',
        plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
      })

      return {
        error: {
          code: 'ALT_TEXT_BASE_FILTER_FAILED',
          message: `Failed to resolve the alt text health base filter for the "${slug}" collection: ${message}`,
        },
      }
    }
  }

  return { baseFilters }
}

/**
 * Evaluates each scanned collection's `read` access for the requesting user.
 * `false` (or a throwing access function, e.g. `Forbidden`) excludes the
 * collection from the report entirely, so a restricted collection never leaks
 * even its existence. `true` or a `Where` constraint keeps it; the scan itself
 * then runs as the user, so Payload enforces the constraint at row level. The
 * resolved constraints also key the cache, keeping scopes apart.
 */
async function resolveReadableCollections(
  req: PayloadRequest,
  collections: NormalizedAltTextCollectionConfig[],
): Promise<{
  constraints: Record<string, true | Where>
  readable: NormalizedAltTextCollectionConfig[]
}> {
  const constraints: Record<string, true | Where> = {}
  const readable: NormalizedAltTextCollectionConfig[] = []

  for (const collection of collections) {
    const readAccess = req.payload.collections?.[collection.slug]?.config.access?.read
    let result: boolean | Where = true

    if (typeof readAccess === 'function') {
      try {
        result = await readAccess({ req })
      } catch {
        result = false
      }
    }

    if (result === false) {
      continue
    }

    constraints[collection.slug] = result
    readable.push(collection)
  }

  return { constraints, readable }
}

export async function getAltTextHealthScan(
  req: PayloadRequest,
  cacheFactory: AltTextHealthCacheFactory<AltTextHealthScan> = unstable_cache,
): Promise<AltTextHealthScan> {
  const { payload } = req
  const pluginConfig = payload.config.custom?.altTextPluginConfig as AltTextPluginConfig | undefined
  const isLocalized = Boolean(payload.config.localization)

  if (!pluginConfig) {
    return createUnknownScan({
      error: {
        code: 'ALT_TEXT_PLUGIN_CONFIG_MISSING',
        message: 'Alt text plugin config not found',
      },
      isLocalized,
      localeCodes: localesFromConfig(payload.config) ?? [],
    })
  }

  const configured = configuredLocales(pluginConfig)

  // Measuring a tenant against locales it does not serve leaves it permanently
  // partial, in a way no editor of that tenant can fix.
  let localeCodes = configured

  if (pluginConfig.filterLocales) {
    try {
      localeCodes = await resolveLocales({ pluginConfig, req })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      payload.logger.error({
        err: error,
        msg: 'Alt text health check failed while resolving the locales to report on.',
        plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
      })

      return createUnknownScan({
        error: {
          code: 'ALT_TEXT_LOCALES_FILTER_FAILED',
          message: `Failed to resolve the alt text health locales: ${message}`,
        },
        isLocalized,
        localeCodes: configured,
      })
    }
  }

  // The Local API writes the locale it is called with onto the request it is
  // given, and joins that request's transaction. The dashboard request is shared
  // by every widget, so the scan runs on a detached request that carries only
  // what access rules and filters read: the user, the headers and the context.
  const scanReq = await createLocalReq(
    {
      context: req.context,
      fallbackLocale: false,
      locale: isLocalized ? 'all' : undefined,
      req: { headers: req.headers, i18n: req.i18n },
      user: req.user ?? undefined,
    },
    payload,
  )

  const { constraints, readable: collections } = await resolveReadableCollections(
    scanReq,
    pluginConfig.collections,
  )

  const resolved = await resolveBaseFilters(req, collections, pluginConfig.healthCheckBaseFilter)

  if ('error' in resolved) {
    return createUnknownScan({ error: resolved.error, isLocalized, localeCodes })
  }

  const { baseFilters } = resolved

  const cacheKeyParts = [
    ALT_TEXT_HEALTH_GLOBAL_TAG,
    [...collections]
      .map(({ slug, mimeTypes }) => `${slug}:${[...mimeTypes].sort().join('|')}`)
      .sort()
      .join(','),
    localeCodes.join(','),
    // The scan is shared across requests, so a scoped scan needs a scoped cache
    // entry. Deriving the key from the resolved access constraints and filters —
    // rather than taking one from the caller — makes it impossible to narrow the
    // scan without also narrowing its cache, which would serve one tenant's
    // counts to another.
    `access:${stableStringify(constraints)}`,
    `filter:${stableStringify(baseFilters)}`,
  ]

  const tags = [
    ALT_TEXT_HEALTH_GLOBAL_TAG,
    ...new Set(collections.map(({ slug }) => getAltTextHealthCollectionTag(slug))),
  ]

  const getCachedHealthScan = createCachedAltTextHealthScan({
    cacheFactory,
    cacheKeyParts,
    compute: async () =>
      computeAltTextHealthScan({
        baseFilters,
        collections,
        isLocalized,
        localeCodes,
        req: scanReq,
      }),
    revalidate: ALT_TEXT_HEALTH_CACHE_TTL,
    tags,
  })

  return getCachedHealthScan()
}

/**
 * Whether the requesting user may view the health report at all, per the
 * configured `healthCheck` access gate. The dashboard widget uses this to hide
 * itself, mirroring the gate enforced on the health endpoint.
 */
export async function canViewHealthReport(req: PayloadRequest): Promise<boolean> {
  const pluginConfig = req.payload.config.custom?.altTextPluginConfig as
    AltTextPluginConfig | undefined

  if (!pluginConfig) {
    return false
  }

  return pluginConfig.healthCheckAccess({ req })
}

export function toWidgetData(scan: AltTextHealthScan): AltTextHealthWidgetData {
  return {
    collections: scan.collections,
    errors: scan.errors,
    isLocalized: scan.isLocalized,
    localeCount: scan.localeCodes.length,
    totalDocs: scan.collections.reduce((total, c) => total + c.totalDocs, 0),
  }
}

/**
 * The health report for the requesting user: only the collections and rows
 * their `read` access admits, further narrowed by `healthCheck.baseFilter`.
 */
export async function getAltTextHealth(req: PayloadRequest): Promise<AltTextHealthScan> {
  return getAltTextHealthScan(req)
}

export async function getAltTextHealthWidgetData(
  req: PayloadRequest,
): Promise<AltTextHealthWidgetData> {
  return toWidgetData(await getAltTextHealthScan(req))
}
