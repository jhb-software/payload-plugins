export { createPageCollectionConfig } from './collections/PageCollectionConfig'
export { createRedirectsCollectionConfig } from './collections/RedirectsCollectionConfig'
export { alternatePathsField } from './fields/alternatePathsField'
export { slugField } from './fields/slugField'
export { payloadPagesPlugin } from './plugin'
export type {
  IncomingPageCollectionConfig,
  PageCollectionConfig,
} from './types/PageCollectionConfig'
export type {
  PageCollectionConfigAttributes,
  IncomingPageCollectionConfigAttributes as PageCollectionIncomingConfigAttributes,
} from './types/PageCollectionConfigAttributes'
export type { PagesPluginConfig } from './types/PagesPluginConfig'
export { getPageUrl } from './utils/getPageUrl'
