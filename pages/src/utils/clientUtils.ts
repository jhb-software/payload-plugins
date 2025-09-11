import type { ClientCollectionConfig } from 'payload'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

export function isPageCollectionConfig(
  config: ClientCollectionConfig,
): config is ClientCollectionConfig & { page: PageCollectionConfigAttributes } {
  return 'page' in config && config.page != null
}

export const asPageCollectionConfigOrThrow = (
  config: ClientCollectionConfig,
): ClientCollectionConfig & { page: PageCollectionConfigAttributes } => {
  if (isPageCollectionConfig(config)) {
    return config
  }

  throw new Error('Collection is not a page collection')
}