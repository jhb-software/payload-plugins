export const ALT_TEXT_HEALTH_PLUGIN_SLUG = 'alt-text'
export const ALT_TEXT_HEALTH_CACHE_TTL = 3600
export const ALT_TEXT_HEALTH_GLOBAL_TAG = 'alt-text-health'

export const getAltTextHealthCollectionTag = (collectionSlug: string): string =>
  `${ALT_TEXT_HEALTH_GLOBAL_TAG}:${collectionSlug}`
