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

    const serverKey = pluginOptions.googleServerApiKey ?? pluginOptions.googleMapsApiKey
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
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        createGeocodingSearchEndpoint({ access: pluginOptions.access }),
      ],
    }
  }
