import type { ClientCollectionConfig, CollectionConfig, SanitizedCollectionConfig } from 'payload'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

/**
 * Whether the collection config is a page collection registered with the pages plugin.
 *
 * @experimental This API is experimental and may change or be removed in a future minor
 * release without a breaking-change bump. It needs more real-world testing before it is
 * marked stable.
 *
 * Works on the raw config before the plugin transforms it, so the page collection slugs can be
 * derived at config-build time (e.g. to configure a rich-text link feature or a page picker):
 *
 * @example
 * ```ts
 * const pageCollectionSlugs = collections.filter(isPageCollectionConfig).map((c) => c.slug)
 * ```
 */
export const isPageCollectionConfig = (
  config: ClientCollectionConfig | CollectionConfig,
): config is PageCollectionConfig => {
  if (!config) {
    console.error('config is not defined')
    return false
  }

  // An unrelated `page` property (a custom field value, a string, null) is not a page config;
  // only the plugin's shape carries the parent attributes.
  return (
    'page' in config &&
    typeof config.page === 'object' &&
    config.page !== null &&
    'parent' in config.page
  )
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
