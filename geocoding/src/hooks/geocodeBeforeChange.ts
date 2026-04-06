import type { FieldHook } from 'payload'

import type { GeocodingResult } from '../services/googleGeocoding.js'
import { geocodeAddress } from '../services/googleGeocoding.js'

/**
 * Gets (or triggers) the geocoding result for the given address, caching it in
 * `req.context` so that the geodata and point field hooks share a single API call.
 *
 * Both hooks may fire concurrently (Payload processes row fields in parallel),
 * so the promise itself is cached — whichever hook runs first starts the fetch,
 * and the other awaits the same promise.
 */
function getCachedGeocodingResult(
  cacheKey: string,
  address: string,
  apiKey: string,
  context: Record<string, unknown>,
): Promise<GeocodingResult[]> {
  if (!context[cacheKey]) {
    context[cacheKey] = geocodeAddress(address.trim(), apiKey)
  }
  return context[cacheKey] as Promise<GeocodingResult[]>
}

function getApiKey(req: { payload: { config: { custom?: Record<string, unknown> } } }): string {
  const apiKey = (
    req.payload.config.custom?.payloadGeocodingPlugin as { googleMapsApiKey?: string } | undefined
  )?.googleMapsApiKey

  if (!apiKey) {
    throw new Error(
      'Geocoding plugin API key not configured. Ensure payloadGeocodingPlugin is added to your Payload config with a googleMapsApiKey.',
    )
  }

  return apiKey
}

function getAddress(
  addressFieldName: string,
  siblingData?: Record<string, unknown>,
  data?: Record<string, unknown>,
): string | undefined {
  const address = siblingData?.[addressFieldName] ?? data?.[addressFieldName]
  if (!address || typeof address !== 'string' || address.trim() === '') {
    return undefined
  }
  return address
}

/**
 * beforeChange hook for the **geodata JSON field**.
 *
 * When `{pointFieldName}_address` contains a string, geocodes it server-side
 * and returns the geocoding result as the field value.
 */
export const createGeoDataBeforeChangeHook = (options: {
  pointFieldName: string
}): FieldHook => {
  return async ({ context, data, req, siblingData }) => {
    const addressFieldName = options.pointFieldName + '_address'
    const address = getAddress(addressFieldName, siblingData, data)

    if (!address) {
      return undefined
    }

    const apiKey = getApiKey(req)
    const cacheKey = `geocoding_${options.pointFieldName}`
    const results = await getCachedGeocodingResult(cacheKey, address, apiKey, context)

    if (results.length === 0) {
      return undefined
    }

    const firstResult = results[0]
    return {
      addressComponents: firstResult.addressComponents,
      formattedAddress: firstResult.formattedAddress,
      location: firstResult.location,
      placeId: firstResult.placeId,
      types: firstResult.types,
    }
  }
}

/**
 * beforeChange hook for the **point field**.
 *
 * When `{pointFieldName}_address` contains a string, geocodes it server-side
 * and returns `[lng, lat]` as the field value.
 */
export const createPointBeforeChangeHook = (options: {
  pointFieldName: string
}): FieldHook => {
  return async ({ context, data, req, siblingData, value }) => {
    const addressFieldName = options.pointFieldName + '_address'
    const address = getAddress(addressFieldName, siblingData, data)

    if (!address) {
      return value
    }

    const apiKey = getApiKey(req)
    const cacheKey = `geocoding_${options.pointFieldName}`
    const results = await getCachedGeocodingResult(cacheKey, address, apiKey, context)

    if (results.length === 0) {
      return value
    }

    const firstResult = results[0]
    return [firstResult.location.lng, firstResult.location.lat]
  }
}
