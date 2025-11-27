import type { CollectionConfig } from 'payload'

import type {
  IncomingRedirectsCollectionConfigAttributes,
  RedirectsCollectionConfigAttributes,
} from './RedirectsCollectionConfigAttributes.js'

/** The plugins incoming config for page collections. */
export type IncomingRedirectsCollectionConfig = {
  redirects: IncomingRedirectsCollectionConfigAttributes
} & CollectionConfig

/** A collection config with additional attributes for page collections after they have been processed. */
export type RedirectsCollectionConfig = {
  redirects: RedirectsCollectionConfigAttributes
} & CollectionConfig
