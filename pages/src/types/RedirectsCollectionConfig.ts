import { CollectionConfig } from 'payload'
import {
  IncomingRedirectsCollectionConfigAttributes,
  RedirectsCollectionConfigAttributes,
} from './RedirectsCollectionConfigAttributes.js'

/** The plugins incoming config for page collections. */
export type IncomingRedirectsCollectionConfig = CollectionConfig & {
  redirects: IncomingRedirectsCollectionConfigAttributes
}

/** A collection config with additional attributes for page collections after they have been processed. */
export type RedirectsCollectionConfig = CollectionConfig & {
  redirects: RedirectsCollectionConfigAttributes
}
