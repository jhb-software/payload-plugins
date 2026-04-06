import type { FieldHook } from 'payload'

import { geocodeAddress } from '../services/googleGeocoding.js'

/**
 * A beforeChange field hook that auto-geocodes address strings server-side.
 *
 * When the `{pointFieldName}_address` field contains a string, this hook:
 * 1. Calls the Google Geocoding API server-side
 * 2. Sets the point field to the first result's coordinates [lng, lat]
 * 3. Sets the geodata field to the full geocoding result
 * 4. Clears the address field after processing
 *
 * This enables agents and API consumers to geocode by simply submitting:
 * { "location_address": "Alexanderplatz, Berlin" }
 */
export const createGeocodeBeforeChangeHook = (options: {
  apiKey: string
  pointFieldName: string
}): FieldHook => {
  return async ({ data, siblingData }) => {
    const addressFieldName = options.pointFieldName + '_address'
    const address = siblingData?.[addressFieldName] ?? data?.[addressFieldName]

    if (!address || typeof address !== 'string' || address.trim() === '') {
      return undefined
    }

    const results = await geocodeAddress(address.trim(), options.apiKey)

    if (results.length === 0) {
      return undefined
    }

    const firstResult = results[0]

    // Set the point field coordinates [lng, lat] (GeoJSON format)
    if (siblingData) {
      siblingData[options.pointFieldName] = [firstResult.location.lng, firstResult.location.lat]
      // Clear the address field after processing
      siblingData[addressFieldName] = undefined
    }

    // Return the geocoding data for the JSON field this hook is attached to
    return {
      addressComponents: firstResult.addressComponents,
      formattedAddress: firstResult.formattedAddress,
      location: firstResult.location,
      placeId: firstResult.placeId,
      types: firstResult.types,
    }
  }
}
