export type GeocodingResult = {
  formattedAddress: string
  googlePlaceId: string
  location: {
    lat: number
    lng: number
  }
  name: string
  types: string[]
}

type GoogleGeocodingApiResponse = {
  error_message?: string
  results: Array<{
    address_components: Array<{
      long_name: string
      short_name: string
      types: string[]
    }>
    formatted_address: string
    geometry: {
      location: {
        lat: number
        lng: number
      }
    }
    place_id: string
    types: string[]
  }>
  status: string
}

/**
 * Server-side geocoding using the Google Geocoding HTTP API.
 * This enables agents and API consumers to geocode addresses without the browser-based Places UI.
 */
export async function geocodeAddress(address: string, apiKey: string): Promise<GeocodingResult[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', apiKey)

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(
      `Google Geocoding API request failed: ${response.status} ${response.statusText}`,
    )
  }

  const data: GoogleGeocodingApiResponse = await response.json()

  if (data.status === 'ZERO_RESULTS') {
    return []
  }

  if (data.status !== 'OK') {
    throw new Error(
      `Google Geocoding API error: ${data.status} - ${data.error_message ?? 'Unknown error'}`,
    )
  }

  return data.results.map((result) => ({
    name: result.address_components[0]?.long_name ?? result.formatted_address,
    formattedAddress: result.formatted_address,
    googlePlaceId: result.place_id,
    location: result.geometry.location,
    types: result.types,
  }))
}
