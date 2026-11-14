import type { PayloadRequest } from 'payload'

import type { Geocoder } from '../geocoder/types.js'

/** Access function for the geocoding search endpoint. */
export type GeocodingEndpointAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

/** Configuration options for the geocoding plugin. */
export type GeocodingPluginConfig = {
  /**
   * Who may call `GET /api/geocoding/search`.
   *
   * @default ({ req }) => Boolean(req.user) — requires authentication
   */
  access?: GeocodingEndpointAccess
  /** Whether the geocoding plugin is enabled. */
  enabled?: boolean
  /**
   * Replaces the bundled Google geocoder for server-side geocoding (the `_address` field, the
   * `address` option, the search endpoint and `geocode()`), e.g. to use another provider.
   */
  geocoder?: Geocoder
  /**
   * Google Maps API key for the address autocomplete in the admin panel. It is sent to the browser,
   * so restrict it by HTTP referrer.
   */
  googleMapsApiKey?: string
  /**
   * Google API key for server-side geocoding (Geocoding API). Google refuses referrer-restricted
   * keys for server-side requests, so use a separate key restricted by IP address or API.
   *
   * @default googleMapsApiKey
   */
  googleServerApiKey?: string
}
