import type { PayloadRequest } from 'payload'

import type { Geocoder } from '../geocoder/types.js'

/** Access function for the geocoding search endpoint. */
export type GeocodingEndpointAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

/** Configuration options for the geocoding plugin. */
export type GeocodingPluginConfig = {
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
   * Google API key for server-side geocoding (Geocoding API): the `{name}_address` field, the
   * `address` option, the search endpoint and `geocode()`. Google refuses referrer-restricted keys
   * for server-side requests, so use a separate key restricted by IP address or to the Geocoding
   * API. Without it (and without `geocoder`), server-side geocoding answers `not_configured`.
   */
  googleServerApiKey?: string
  /**
   * `GET /api/geocoding/search`. Pass `false` to not register it.
   *
   * `access` defaults to users of the admin user collection (`config.admin.user`), so a public
   * customer signup cannot spend the geocoding quota.
   */
  searchEndpoint?: { access?: GeocodingEndpointAccess } | false
}
