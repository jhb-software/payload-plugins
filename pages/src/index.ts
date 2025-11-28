import type {
  PageCollectionConfigAttributes,
  SanitizedPageCollectionConfigAttributes,
} from './types/PageCollectionConfigAttributes.js'
import type {
  RedirectsCollectionConfigAttributes,
  SanitizedRedirectsCollectionConfigAttributes,
} from './types/RedirectsCollectionConfigAttributes.js'

export { alternatePathsField } from './fields/alternatePathsField.js'
export { slugField } from './fields/slugField.js'
export { payloadPagesPlugin } from './plugin.js'
export type {
  PageCollectionConfigAttributes,
  SanitizedPageCollectionConfigAttributes,
} from './types/PageCollectionConfigAttributes.js'
export type { PagesPluginConfig } from './types/PagesPluginConfig.js'
export type {
  RedirectsCollectionConfigAttributes,
  SanitizedRedirectsCollectionConfigAttributes,
} from './types/RedirectsCollectionConfigAttributes.js'
export { childDocumentsOf, hasChildDocuments } from './utils/childDocumentsOf.js'

/**
 * Module augmentation to extend Payload's CollectionCustom interface.
 * This enables type-safe `custom.pagesPlugin` configuration on collections.
 */
declare module 'payload' {
  export interface CollectionCustom {
    /**
     * Configuration for the pages plugin.
     * A collection can either be a page collection OR a redirects collection, not both.
     */
    pagesPlugin?:
      | {
          /** Internal: Sanitized page configuration (set by the plugin after processing) */
          _page?: SanitizedPageCollectionConfigAttributes
          /**
           * Configuration for page collections.
           * When defined, the collection will be processed by the pages plugin to add
           * parent, path, breadcrumbs, and slug fields.
           */
          page: PageCollectionConfigAttributes
        }
      | {
          /** Internal: Sanitized redirects configuration (set by the plugin after processing) */
          _redirects?: SanitizedRedirectsCollectionConfigAttributes
          /**
           * Configuration for redirects collections.
           * When defined, the collection will be processed by the pages plugin to add
           * sourcePath, destinationPath, type, and reason fields.
           */
          redirects: RedirectsCollectionConfigAttributes
        }
  }
}
