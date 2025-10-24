/**
 * Plugin state manager using singleton pattern to store the Google Maps API key.
 *
 * Why use a singleton pattern?
 * ==========================
 * The geocodingField() function is called directly by users in their collection
 * definitions, without access to the plugin configuration. Unlike other plugins
 * that create collections internally (like pages plugin's createPageCollectionConfig),
 * our field helper is part of the public API.
 *
 * Flow:
 * 1. Plugin initializes -> stores API key in singleton
 * 2. User calls geocodingField() in collection -> retrieves key from singleton
 * 3. Field passes key to client component via clientProps
 *
 * This is the cleanest way to bridge the gap between plugin initialization
 * and user-called field helpers, without forcing users to manually pass the
 * API key to every field instance.
 */

let pluginApiKey: string | null = null

/**
 * Sets the Google Maps API key for the geocoding plugin.
 * Called by the plugin during initialization.
 */
export const setPluginApiKey = (apiKey: string): void => {
  pluginApiKey = apiKey
}

/**
 * Gets the Google Maps API key for the geocoding plugin.
 * Throws an error if the API key has not been configured.
 */
export const getPluginApiKey = (): string => {
  if (!pluginApiKey) {
    throw new Error(
      'Geocoding plugin API key not configured. Ensure payloadGeocodingPlugin is added to your Payload config with a googleMapsApiKey.',
    )
  }
  return pluginApiKey
}
