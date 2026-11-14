import type { Config } from 'payload'

import type { PluginCustom } from './pluginCustom.js'
import type { GeocodingPluginConfig } from './types/GeoCodingPluginConfig.js'

import { PLUGIN_SLUG } from './constants.js'
import { createGeocodingSearchEndpoint } from './endpoints/geocodingSearch.js'
import { createGoogleGeocoder } from './geocoder/google.js'

/**
 * Payload plugin which extends the point field with geocoding functionality.
 */
export const payloadGeocodingPlugin =
  (pluginOptions: GeocodingPluginConfig) =>
  (incomingConfig: Config): Config => {
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    // No fallback to googleMapsApiKey: that key reaches the browser and is referrer-restricted,
    // and Google refuses such keys server-side.
    const serverKey = pluginOptions.googleServerApiKey
    const custom: PluginCustom = {
      geocoder:
        pluginOptions.geocoder ??
        (serverKey ? createGoogleGeocoder({ apiKey: serverKey }) : undefined),
      googleMapsApiKey: pluginOptions.googleMapsApiKey,
    }

    return {
      ...incomingConfig,
      // `custom` is server-only: the server key and geocoder never reach the browser.
      custom: { ...incomingConfig.custom, [PLUGIN_SLUG]: custom },
      endpoints:
        pluginOptions.searchEndpoint === false
          ? incomingConfig.endpoints
          : [
              ...(incomingConfig.endpoints ?? []),
              createGeocodingSearchEndpoint({ access: pluginOptions.searchEndpoint?.access }),
            ],
    }
  }
