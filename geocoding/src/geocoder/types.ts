/**
 * How exactly a result pins the queried address, from most to least exact:
 *
 * - `exact`: the building or entrance (Google `ROOFTOP`)
 * - `interpolated`: a point between two known house numbers (Google `RANGE_INTERPOLATED`)
 * - `center`: the center of a street, area or polygon (Google `GEOMETRIC_CENTER`)
 * - `approximate`: a city, postal code or region (Google `APPROXIMATE`)
 */
export type GeocodePrecision = 'approximate' | 'center' | 'exact' | 'interpolated'

/** What to geocode. */
export type GeocodeQuery = {
  /** A free-form address, e.g. `Alexanderplatz 1, 10178 Berlin`. */
  address: string
  /**
   * ISO 3166-1 alpha-2 country code (`DE`, `US`) the result must lie in. Pass it whenever the
   * country is known: without it, a street name that exists in several countries can resolve to
   * the wrong one.
   */
  country?: string
  /** Language of the returned address, e.g. `de` or `en-GB`. */
  language?: string
}

/** One place an address resolved to. */
export type GeocodingResult = {
  formattedAddress: string
  /** `[longitude, latitude]`, the order a Payload point field stores. */
  location: { lat: number; lng: number }
  name: string
  /** True when the provider matched only part of the address (e.g. the street, not the number). */
  partialMatch: boolean
  /** The provider's id for the place (a Google Place ID for the bundled geocoder). */
  placeId: string
  precision: GeocodePrecision
  types: string[]
}

/**
 * Why geocoding produced no usable result:
 *
 * - `no_results`: the address matched nothing
 * - `denied`: the provider refused the key (wrong key, API not enabled, referrer-restricted key)
 * - `quota`: the key is over its quota or rate limit
 * - `invalid_request`: the query was empty or malformed
 * - `unavailable`: the provider could not be reached or failed
 * - `not_configured`: no geocoder is configured
 */
export type GeocodeFailureReason =
  'denied' | 'invalid_request' | 'no_results' | 'not_configured' | 'quota' | 'unavailable'

/** The answer of a geocoder. Never thrown: a failure is a value the caller decides about. */
export type GeocodeOutcome =
  | { message: string; ok: false; reason: GeocodeFailureReason }
  | { ok: true; results: GeocodingResult[] }

/**
 * A geocoding provider. The plugin bundles a Google implementation (`createGoogleGeocoder`); pass
 * any other function of this shape as the plugin's `geocoder` option to use another provider.
 *
 * Results are ordered best match first. An address that matches nothing is
 * `{ ok: false, reason: 'no_results' }`, not an empty list.
 */
export type Geocoder = (query: GeocodeQuery) => Promise<GeocodeOutcome>
