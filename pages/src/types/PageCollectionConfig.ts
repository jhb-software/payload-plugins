import type { CollectionConfig } from 'payload'

import type {
  IncomingPageCollectionConfigAttributes,
  PageCollectionConfigAttributes,
} from './PageCollectionConfigAttributes.js'

/** The plugins incoming config for page collections. */
export type IncomingPageCollectionConfig = {
  page: IncomingPageCollectionConfigAttributes
} & CollectionConfig

/** A collection config with additional attributes for page collections after they have been processed. */
export type PageCollectionConfig = {
  page: PageCollectionConfigAttributes
} & CollectionConfig
