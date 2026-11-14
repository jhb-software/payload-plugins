import type { PayloadRequest } from 'payload'

import type { GeocodeOutcome, GeocodeQuery } from './geocoder/types.js'

import { PLUGIN_SLUG } from './constants.js'
import { getPluginCustom } from './pluginCustom.js'

const NOT_CONFIGURED: GeocodeOutcome = {
  message:
    'No geocoder is configured. Pass `googleServerApiKey`, `googleMapsApiKey` or `geocoder` to payloadGeocodingPlugin.',
  ok: false,
  reason: 'not_configured',
}

function cacheFor(req: PayloadRequest): Map<string, Promise<GeocodeOutcome>> {
  const key = `${PLUGIN_SLUG}:geocodeCache`
  const existing = req.context[key]
  if (existing instanceof Map) {
    return existing as Map<string, Promise<GeocodeOutcome>>
  }
  const created = new Map<string, Promise<GeocodeOutcome>>()
  req.context[key] = created
  return created
}

/**
 * Geocodes an address with the geocoder configured on `payloadGeocodingPlugin`. Never throws: a
 * failure is `{ ok: false, reason, message }`, and `message` says what to do about it.
 *
 * Identical queries within one request share a single provider call. `language` defaults to the
 * request locale.
 *
 * @example
 * const outcome = await geocode({ req, address: 'Alexanderplatz 1, Berlin', country: 'DE' })
 * if (outcome.ok) {
 *   const { lat, lng } = outcome.results[0].location
 * }
 */
export function geocode(args: { req: PayloadRequest } & GeocodeQuery): Promise<GeocodeOutcome> {
  const { req, ...rest } = args
  const geocoder = getPluginCustom(req.payload.config)?.geocoder
  if (!geocoder) {
    return Promise.resolve(NOT_CONFIGURED)
  }

  const language =
    rest.language ??
    (typeof req.locale === 'string' && req.locale !== 'all' ? req.locale : undefined)
  const query: GeocodeQuery = {
    address: rest.address.trim(),
    country: rest.country?.trim().toUpperCase() || undefined,
    language,
  }

  const cache = cacheFor(req)
  const key = JSON.stringify([query.address, query.country, query.language])
  let outcome = cache.get(key)
  if (!outcome) {
    outcome = geocoder(query)
    cache.set(key, outcome)
  }
  return outcome
}
