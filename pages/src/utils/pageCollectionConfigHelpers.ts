import type { ClientCollectionConfig, CollectionConfig } from 'payload'
import type { PageCollectionConfig } from 'src/types/PageCollectionConfig.js'

/** Checks if the config is a PageCollectionConfig. */
export const isPageCollectionConfig = (
  config: ClientCollectionConfig | CollectionConfig,
): config is PageCollectionConfig => {
  if (!config) {
    console.error('config is not defined')
    return false
  }

  return 'page' in config && typeof config.page === 'object'
}

/**
 * Returns the PageCollectionConfig or null if the config is not a PageCollectionConfig.
 *
 * This provides type-safe access to the page attributes.
 */
export const asPageCollectionConfig = (
  config: ClientCollectionConfig | CollectionConfig,
): null | PageCollectionConfig => {
  if (isPageCollectionConfig(config)) {
    return config
  }
  return null
}

/**
 * Returns the PageCollectionConfig or throws an error if the config is not a PageCollectionConfig.
 *
 * This provides type-safe access to the page attributes.
 */
export const asPageCollectionConfigOrThrow = (
  config: ClientCollectionConfig | CollectionConfig,
): PageCollectionConfig => {
  if (isPageCollectionConfig(config)) {
    return config
  }

  throw new Error('Collection is not a page collection')
}
