import { beforeEach, describe, expect, it, vi } from 'vitest'

import { geocodeAddress } from './googleGeocoding.js'

const MOCK_API_KEY = 'test-api-key'

const MOCK_GOOGLE_RESPONSE = {
  results: [
    {
      address_components: [
        { long_name: 'Alexanderplatz', short_name: 'Alexanderplatz', types: ['point_of_interest'] },
        { long_name: 'Berlin', short_name: 'Berlin', types: ['locality'] },
      ],
      formatted_address: 'Alexanderplatz, 10178 Berlin, Germany',
      geometry: {
        location: { lat: 52.5219, lng: 13.4132 },
      },
      place_id: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      types: ['point_of_interest', 'establishment'],
    },
  ],
  status: 'OK',
}

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns geocoded results for a valid address', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_GOOGLE_RESPONSE), { status: 200 }),
    )

    const results = await geocodeAddress('Alexanderplatz, Berlin', MOCK_API_KEY)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      addressComponents: MOCK_GOOGLE_RESPONSE.results[0].address_components,
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      location: { lat: 52.5219, lng: 13.4132 },
      placeId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      types: ['point_of_interest', 'establishment'],
    })

    // Verify the API was called with the correct URL
    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string
    expect(fetchCall).toContain('address=Alexanderplatz')
    expect(fetchCall).toContain(`key=${MOCK_API_KEY}`)
  })

  it('returns empty array for ZERO_RESULTS', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [], status: 'ZERO_RESULTS' }), { status: 200 }),
    )

    const results = await geocodeAddress('xyznonexistent12345', MOCK_API_KEY)
    expect(results).toEqual([])
  })

  it('throws on API error status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error_message: 'Invalid key', results: [], status: 'REQUEST_DENIED' }),
        { status: 200 },
      ),
    )

    await expect(geocodeAddress('Berlin', MOCK_API_KEY)).rejects.toThrow(
      'Google Geocoding API error: REQUEST_DENIED - Invalid key',
    )
  })

  it('throws on HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(geocodeAddress('Berlin', MOCK_API_KEY)).rejects.toThrow(
      'Google Geocoding API request failed: 500 Internal Server Error',
    )
  })
})
