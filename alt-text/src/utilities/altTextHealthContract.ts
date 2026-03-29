export const ALT_TEXT_HEALTH_PLUGIN_SLUG = 'alt-text'
export const ALT_TEXT_HEALTH_CONTRACT_VERSION = 1 as const

export type AltTextHealthStatus = 'degraded' | 'healthy' | 'unknown' | 'unhealthy'
export type AltTextHealthCollectionStatus = Exclude<AltTextHealthStatus, 'unknown'>
export type AltTextHealthFreshness = 'fresh' | 'stale'

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

export type AltTextHealthContractCollection = {
  collection: string
  completeDocs: number
  invalidDocCount: number
  missingDocs: number
  partialDocs: number
  status: AltTextHealthCollectionStatus
  totalDocs: number
}

export type AltTextHealthContract = {
  checkedAt: string
  contractVersion: typeof ALT_TEXT_HEALTH_CONTRACT_VERSION
  details: {
    collections: AltTextHealthContractCollection[]
  }
  errors: AltTextHealthError[]
  freshness: {
    state: AltTextHealthFreshness
    ttlSeconds: number
  }
  plugin: typeof ALT_TEXT_HEALTH_PLUGIN_SLUG
  status: AltTextHealthStatus
  summary: {
    checkedCollectionCount: number
    collectionCount: number
    completeDocs: number
    failedCollectionCount: number
    invalidDocs: number
    isLocalized: boolean
    localeCount: number
    missingDocs: number
    partialDocs: number
    totalDocs: number
  }
}

export type AltTextHealthWidgetCollection = AltTextHealthContractCollection & {
  error?: AltTextHealthError
  invalidDocIds: (number | string)[] | undefined
}

export type AltTextHealthWidgetData = {
  collections: AltTextHealthWidgetCollection[]
  contract: AltTextHealthContract
}

export function getAltTextHealthCollectionStatus(
  collection: Pick<AltTextHealthScanCollection, 'error' | 'missingDocs' | 'partialDocs'>,
): AltTextHealthCollectionStatus {
  if (collection.error) {
    return 'degraded'
  }

  if (collection.missingDocs + collection.partialDocs > 0) {
    return 'unhealthy'
  }

  return 'healthy'
}

export function getAltTextHealthFreshness(
  checkedAt: string,
  ttlSeconds: number,
): AltTextHealthFreshness {
  const ageMs = Date.now() - Date.parse(checkedAt)

  return ageMs > ttlSeconds * 1000 ? 'stale' : 'fresh'
}

export function getAltTextHealthStatus(scan: AltTextHealthScan): AltTextHealthStatus {
  if (scan.errors.some((error) => error.code === 'ALT_TEXT_PLUGIN_CONFIG_MISSING')) {
    return 'unknown'
  }

  if (scan.errors.length > 0) {
    return 'degraded'
  }

  const invalidDocs = scan.collections.reduce(
    (total, collection) => total + collection.missingDocs + collection.partialDocs,
    0,
  )

  return invalidDocs > 0 ? 'unhealthy' : 'healthy'
}

function mapCollection(collection: AltTextHealthScanCollection): AltTextHealthContractCollection {
  return {
    collection: collection.collection,
    completeDocs: collection.completeDocs,
    invalidDocCount: collection.missingDocs + collection.partialDocs,
    missingDocs: collection.missingDocs,
    partialDocs: collection.partialDocs,
    status: getAltTextHealthCollectionStatus(collection),
    totalDocs: collection.totalDocs,
  }
}

export function mapAltTextHealthScanToContract(
  scan: AltTextHealthScan,
  { ttlSeconds }: { ttlSeconds: number },
): AltTextHealthContract {
  const collections = scan.collections.map(mapCollection)

  return {
    checkedAt: scan.checkedAt,
    contractVersion: ALT_TEXT_HEALTH_CONTRACT_VERSION,
    details: {
      collections,
    },
    errors: scan.errors,
    freshness: {
      state: getAltTextHealthFreshness(scan.checkedAt, ttlSeconds),
      ttlSeconds,
    },
    plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
    status: getAltTextHealthStatus(scan),
    summary: {
      checkedCollectionCount: collections.filter((collection) => collection.status !== 'degraded')
        .length,
      collectionCount: collections.length,
      completeDocs: collections.reduce((total, collection) => total + collection.completeDocs, 0),
      failedCollectionCount: collections.filter((collection) => collection.status === 'degraded')
        .length,
      invalidDocs: collections.reduce((total, collection) => total + collection.invalidDocCount, 0),
      isLocalized: scan.isLocalized,
      localeCount: scan.localeCodes.length,
      missingDocs: collections.reduce((total, collection) => total + collection.missingDocs, 0),
      partialDocs: collections.reduce((total, collection) => total + collection.partialDocs, 0),
      totalDocs: collections.reduce((total, collection) => total + collection.totalDocs, 0),
    },
  }
}

export function mapAltTextHealthScanToWidgetData(
  scan: AltTextHealthScan,
  { ttlSeconds }: { ttlSeconds: number },
): AltTextHealthWidgetData {
  return {
    collections: scan.collections.map((collection) => ({
      ...mapCollection(collection),
      error: collection.error,
      invalidDocIds: collection.invalidDocIds,
    })),
    contract: mapAltTextHealthScanToContract(scan, { ttlSeconds }),
  }
}
