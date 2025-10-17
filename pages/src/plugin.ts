import type { Config } from 'payload'
import type { PagesPluginConfig } from './types/PagesPluginConfig.js'
import { translations } from './translations/index.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'
import { createPageCollectionConfig } from './collections/PageCollectionConfig.js'
import { IncomingPageCollectionConfig } from './types/PageCollectionConfig.js'
import { createRedirectsCollectionConfig } from './collections/RedirectsCollectionConfig.js'
import { IncomingRedirectsCollectionConfig } from './types/RedirectsCollectionConfig.js'

/** Payload plugin which integrates fields for managing website pages. */
export const payloadPagesPlugin =
  (pluginOptions: PagesPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return config
    }

    config.onInit = async (payload) => {
      if (incomingConfig.onInit) {
        await incomingConfig.onInit(payload)
      }
    }

    // Ensure collections array exists
    config.collections = config.collections || []

    // Find and transform collections
    config.collections = config.collections.map((collection) => {
      if ('page' in collection) {
        // Create page collection using the page configuration
        return createPageCollectionConfig({
          collectionConfig: collection as IncomingPageCollectionConfig,
          pluginConfig: pluginOptions,
        })
      } else if ('redirects' in collection) {
        // Create redirects collection using the redirects configuration
        return createRedirectsCollectionConfig({
          collectionConfig: collection as IncomingRedirectsCollectionConfig,
          pluginConfig: pluginOptions,
        })
      }
      return collection
    })

    return {
      ...config,
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
    }
  }
