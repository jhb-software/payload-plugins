import type { Config } from 'payload'

import type { GeocodingPluginConfig } from './types/GeoCodingPluginConfig.js'

import { createGeocodingSearchEndpoint } from './endpoints/geocodingSearch.js'

/**
 * Payload plugin which extends the point field with geocoding functionality.
 */
export const payloadGeocodingPlugin =
  (pluginOptions: GeocodingPluginConfig) =>
  (incomingConfig: Config): Config => {
    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    const geocodingEndpoint = createGeocodingSearchEndpoint({
      access: pluginOptions.geocodingEndpoint?.access,
      apiKey: pluginOptions.googleMapsApiKey,
    })

    // Store API key in config.custom for server component access
    const config: Config = {
      ...incomingConfig,
      custom: {
        ...incomingConfig.custom,
        payloadGeocodingPlugin: {
          googleMapsApiKey: pluginOptions.googleMapsApiKey,
        },
      },
      endpoints: [...(incomingConfig.endpoints ?? []), geocodingEndpoint],
    }

    return config
  }
