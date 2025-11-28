import type { CollectionConfig } from 'payload'

import type { SanitizedPageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

/** Gets the pagesPlugin property from a collection config. */
const getPagesPlugin = (config: CollectionConfig): Record<string, unknown> | undefined => {
  return config.custom?.pagesPlugin as Record<string, unknown> | undefined
}

/** Checks if the collection has been processed by the pages plugin (has custom.pagesPlugin._page). */
export const isPageCollectionConfig = (config: CollectionConfig): boolean => {
  if (!config) {
    console.error('config is not defined')
    return false
  }

  const pagesPlugin = getPagesPlugin(config)
  return pagesPlugin?._page !== undefined
}

/**
 * Returns the sanitized page config attributes or null if the collection is not a page collection.
 *
 * This provides type-safe access to the page attributes.
 */
export const getPageConfig = (
  config: CollectionConfig,
): null | SanitizedPageCollectionConfigAttributes => {
  const pagesPlugin = getPagesPlugin(config)
  if (pagesPlugin?._page) {
    return pagesPlugin._page as SanitizedPageCollectionConfigAttributes
  }
  return null
}

/**
 * Returns the sanitized page config attributes or throws an error if the collection is not a page collection.
 *
 * This provides type-safe access to the page attributes.
 */
export const getPageConfigOrThrow = (
  config: CollectionConfig,
): SanitizedPageCollectionConfigAttributes => {
  const pageConfig = getPageConfig(config)
  if (pageConfig) {
    return pageConfig
  }

  throw new Error('Collection is not a page collection')
}

/** Checks if a pagesPlugin config is a page collection config. */
export const isPagesPluginPageConfig = (pagesPlugin: unknown): pagesPlugin is { page: unknown } => {
  return (
    pagesPlugin !== undefined &&
    pagesPlugin !== null &&
    typeof pagesPlugin === 'object' &&
    'page' in pagesPlugin
  )
}

/** Checks if a pagesPlugin config is a redirects collection config. */
export const isPagesPluginRedirectsConfig = (
  pagesPlugin: unknown,
): pagesPlugin is { redirects: unknown } => {
  return (
    pagesPlugin !== undefined &&
    pagesPlugin !== null &&
    typeof pagesPlugin === 'object' &&
    'redirects' in pagesPlugin
  )
}

/** Checks if the collection has been processed by the pages plugin as a redirects collection. */
export const isRedirectsCollectionConfig = (config: CollectionConfig): boolean => {
  if (!config) {
    return false
  }

  const pagesPlugin = getPagesPlugin(config)
  return pagesPlugin?._redirects !== undefined
}
