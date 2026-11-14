import type {
  GeocodeFailureReason,
  GeocodeOutcome,
  GeocodePrecision,
  GeocodeQuery,
  Geocoder,
  GeocodingResult,
} from './types.js'

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'

type GoogleResult = {
  formatted_address: string
  geometry: { location: { lat: number; lng: number }; location_type?: string }
  partial_match?: boolean
  place_id: string
  types?: string[]
}

type GoogleResponse = {
  error_message?: string
  results?: GoogleResult[]
  status: string
}

const PRECISION: Record<string, GeocodePrecision> = {
  APPROXIMATE: 'approximate',
  GEOMETRIC_CENTER: 'center',
  RANGE_INTERPOLATED: 'interpolated',
  ROOFTOP: 'exact',
}

const FAILURE: Record<string, GeocodeFailureReason> = {
  INVALID_REQUEST: 'invalid_request',
  OVER_DAILY_LIMIT: 'quota',
  OVER_QUERY_LIMIT: 'quota',
  REQUEST_DENIED: 'denied',
  ZERO_RESULTS: 'no_results',
}

const HINT: Record<GeocodeFailureReason, string> = {
  denied:
    'Google refused the API key. Use a key with the Geocoding API enabled that is not restricted by HTTP referrer (server-side requests send no referrer), e.g. via the plugin option `googleServerApiKey`.',
  invalid_request: 'Send a non-empty address.',
  no_results: 'Check the spelling, or add the postal code, city or country.',
  not_configured: '',
  quota: 'The Google API key is over its quota. Retry later or raise the quota.',
  unavailable: 'Retry later.',
}

function failure(reason: GeocodeFailureReason, detail: string): GeocodeOutcome {
  return { message: `${detail} ${HINT[reason]}`.trim(), ok: false, reason }
}

function toResult(result: GoogleResult): GeocodingResult {
  return {
    // The first segment names the place ("Alexanderplatz 1", "Berlin"); the first address
    // component of a street address is only its house number.
    name: result.formatted_address.split(',')[0].trim(),
    formattedAddress: result.formatted_address,
    location: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
    partialMatch: result.partial_match === true,
    placeId: result.place_id,
    precision: PRECISION[result.geometry.location_type ?? ''] ?? 'approximate',
    types: result.types ?? [],
  }
}

function buildUrl(query: GeocodeQuery, apiKey: string): string {
  const url = new URL(ENDPOINT)
  url.searchParams.set('address', query.address)
  url.searchParams.set('key', apiKey)
  if (query.country) {
    url.searchParams.set('components', `country:${query.country}`)
  }
  if (query.language) {
    url.searchParams.set('language', query.language)
  }
  return url.toString()
}

/**
 * A geocoder backed by the Google Geocoding API. The key must allow server-side requests: Google
 * refuses keys restricted by HTTP referrer here.
 */
export function createGoogleGeocoder(options: { apiKey: string }): Geocoder {
  return async (query) => {
    if (query.address.trim() === '') {
      return failure('invalid_request', 'The address is empty.')
    }

    let body: GoogleResponse
    try {
      const response = await fetch(buildUrl(query, options.apiKey))
      if (!response.ok) {
        return failure('unavailable', `Google answered HTTP ${response.status}.`)
      }
      body = await response.json()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return failure('unavailable', `Google could not be reached (${detail}).`)
    }

    if (body.status === 'OK' && body.results && body.results.length > 0) {
      return { ok: true, results: body.results.map(toResult) }
    }

    const reason = FAILURE[body.status] ?? 'unavailable'
    const detail =
      reason === 'no_results'
        ? `No place matches "${query.address}"${query.country ? ` in ${query.country}` : ''}.`
        : `Google answered ${body.status}${body.error_message ? `: ${body.error_message.replace(/[.\s]+$/, '')}` : ''}.`
    return failure(reason, detail)
  }
}
