import { afterEach, describe, expect, test, vi } from 'vitest'

import { createGoogleGeocoder } from './google.js'

const geocoder = createGoogleGeocoder({ apiKey: 'server-key' })

function answer(body: unknown, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Google geocoder', () => {
  test('reports an interpolated partial match as such', async () => {
    answer({
      results: [
        {
          formatted_address: 'Hauptstraße, 10827 Berlin, Germany',
          geometry: { location: { lat: 52.48, lng: 13.35 }, location_type: 'RANGE_INTERPOLATED' },
          partial_match: true,
          place_id: 'p1',
          types: ['route'],
        },
      ],
      status: 'OK',
    })

    const outcome = await geocoder({ address: 'Hauptstraße 999, Berlin' })

    expect(outcome).toMatchObject({
      ok: true,
      results: [{ partialMatch: true, placeId: 'p1', precision: 'interpolated' }],
    })
  })

  test('passes on why Google refused the key, and how to fix it', async () => {
    answer({ error_message: 'The provided API key is invalid.', status: 'REQUEST_DENIED' })
    const outcome = await geocoder({ address: 'Berlin' })
    expect(outcome).toMatchObject({ ok: false, reason: 'denied' })
    expect(!outcome.ok && outcome.message).toBe(
      'Google answered REQUEST_DENIED: The provided API key is invalid. Google refused the API key. Use a key with the Geocoding API enabled that is not restricted by HTTP referrer (server-side requests send no referrer), e.g. via the plugin option `googleServerApiKey`.',
    )
  })

  test('tells an exhausted quota apart from a refused key', async () => {
    answer({ status: 'OVER_QUERY_LIMIT' })
    expect(await geocoder({ address: 'Berlin' })).toMatchObject({ ok: false, reason: 'quota' })
  })

  test('reports an HTTP failure as unavailable instead of throwing', async () => {
    answer({}, 500)
    expect(await geocoder({ address: 'Berlin' })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    })
  })

  test('refuses an empty address without calling Google', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await geocoder({ address: '  ' })).toMatchObject({
      ok: false,
      reason: 'invalid_request',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
