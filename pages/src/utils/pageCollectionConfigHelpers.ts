import type { ClientCollectionConfig, CollectionConfig, SanitizedCollectionConfig } from 'payload'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

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
 * Returns the page attributes of a collection, or undefined if it is not a page collection.
 *
 * Prefers `custom.pageConfig`, which is where the attributes live on the sanitized config a hook
 * receives, and falls back to the `page` block of a config that has not been sanitized yet.
 */
export const pageAttributesOf = (
  config: ClientCollectionConfig | CollectionConfig | null | SanitizedCollectionConfig | undefined,
): PageCollectionConfigAttributes | undefined => {
  if (!config) {
    return undefined
  }

  const fromCustom = ('custom' in config ? config.custom?.pageConfig : undefined) as
    PageCollectionConfigAttributes | undefined

  if (fromCustom) {
    return fromCustom
  }

  return 'page' in config && typeof config.page === 'object'
    ? (config.page as PageCollectionConfigAttributes)
    : undefined
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
