import { v2 as cloudinary } from 'cloudinary'
import type { Config } from 'payload'

import type { CloudinaryPluginConfig } from './types/CloudinaryPluginConfig'
import { extendUploadCollectionConfig } from './utils/extendUploadCollectionConfig'

/** Payload plugin which integrates cloudinary for hosting media collection items. */
export const payloadCloudinaryPlugin =
  (pluginOptions: CloudinaryPluginConfig) =>
  (incomingConfig: Config): Config => {
    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    cloudinary.config({
      cloud_name: pluginOptions.cloudinary.cloudName,
      api_key: pluginOptions.credentials.apiKey,
      api_secret: pluginOptions.credentials.apiSecret,
    })

    return {
      ...incomingConfig,
      collections: incomingConfig.collections?.map((collection) => {
        if (pluginOptions.uploadCollections?.includes(collection.slug)) {
          return extendUploadCollectionConfig({
            config: collection,
            pluginConfig: pluginOptions,
          })
        }
        return collection
      }),
    }
  }
