import type { Config } from 'payload'

import type { PayloadGeocodingOptions } from './types.js'

export const payloadGeocodingPlugin =
  (pluginOptions: PayloadGeocodingOptions) =>
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

      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
        throw new Error(
          'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required for the geocoding plugin but not defined.',
        )
      }
    }

    return config
  }
