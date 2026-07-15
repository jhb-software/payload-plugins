export { payloadAltTextPlugin } from './plugin.js'
export { openAIResolver } from './resolvers/openAI.js'
export * from './resolvers/types.js'
export type {
  AltTextCollectionConfig,
  IncomingAltTextPluginConfig as AltTextPluginConfig,
} from './types/AltTextPluginConfig.js'
export { getAltTextHealth } from './utilities/altTextHealth.js'
export type {
  AltTextHealthError,
  AltTextHealthErrorCode,
  AltTextHealthScan,
  AltTextHealthScanCollection,
} from './utilities/altTextHealth.js'
export { matchesMimeType, validateAltText } from './utilities/mimeTypes.js'
