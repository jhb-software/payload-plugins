import type { Config } from 'payload'

import type { GeocodingPluginConfig } from './types/GeoCodingPluginConfig'
import { setPluginApiKey } from './plugin-state'

/**
 * Payload plugin which extends the point field with geocoding functionality.
 *
 * The plugin stores the Google Maps API key in a singleton state manager,
 * allowing the geocodingField() helper function to access it when users
 * create geocoding fields in their collections.
 */
export const payloadGeocodingPlugin =
  (pluginOptions: GeocodingPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return config
    }

    // Store API key in singleton for field access
    // This allows geocodingField() to retrieve the API key when users
    // call it in their collection definitions
    setPluginApiKey(pluginOptions.googleMapsApiKey)

    return config
  }
