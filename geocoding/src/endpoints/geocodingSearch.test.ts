import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as geocodingService from '../services/googleGeocoding.js'
import { createGeocodingSearchEndpoint } from './geocodingSearch.js'

const MOCK_API_KEY = 'test-api-key'

const MOCK_RESULT = {
  addressComponents: [],
  formattedAddress: 'Berlin, Germany',
  location: { lat: 52.52, lng: 13.405 },
  placeId: 'ChIJAVkDPzdOqEcRcDteW0YgIQQ',
  types: ['locality'],
}

function createMockRequest(overrides: { url: string } & Partial<PayloadRequest>): PayloadRequest {
  return { user: { id: '1', email: 'test@test.com' }, ...overrides } as unknown as PayloadRequest
}

describe('createGeocodingSearchEndpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when user is not authenticated (default access)', async () => {
    const endpoint = createGeocodingSearchEndpoint({ apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search?q=Berlin', user: null as any })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.errors[0].message).toBe('Unauthorized')
  })

  it('returns 200 with results for authenticated user', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const endpoint = createGeocodingSearchEndpoint({ apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search?q=Berlin' })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].formattedAddress).toBe('Berlin, Germany')
    expect(body.results[0].location).toEqual({ lat: 52.52, lng: 13.405 })
  })

  it('returns 400 when q parameter is missing', async () => {
    const endpoint = createGeocodingSearchEndpoint({ apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search' })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.errors[0].message).toBe('Query parameter "q" is required')
  })

  it('returns 400 when q parameter is empty', async () => {
    const endpoint = createGeocodingSearchEndpoint({ apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search?q=%20' })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(400)
  })

  it('uses custom access function when provided', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const customAccess = vi.fn().mockResolvedValue(true)
    const endpoint = createGeocodingSearchEndpoint({ access: customAccess, apiKey: MOCK_API_KEY })
    const req = createMockRequest({
      url: 'http://localhost/api/geocoding/search?q=Berlin',
      user: null as any,
    })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(200)
    expect(customAccess).toHaveBeenCalledWith(req)
  })

  it('denies access when custom access function returns false', async () => {
    const customAccess = vi.fn().mockResolvedValue(false)
    const endpoint = createGeocodingSearchEndpoint({ access: customAccess, apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search?q=Berlin' })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(401)
  })

  it('returns 502 when geocoding service fails', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockRejectedValue(
      new Error('Google Geocoding API error: REQUEST_DENIED'),
    )

    const endpoint = createGeocodingSearchEndpoint({ apiKey: MOCK_API_KEY })
    const req = createMockRequest({ url: 'http://localhost/api/geocoding/search?q=Berlin' })

    const response = await endpoint.handler(req)
    expect(response.status).toBe(502)

    const body = await response.json()
    expect(body.errors[0].message).toContain('REQUEST_DENIED')
  })
})
