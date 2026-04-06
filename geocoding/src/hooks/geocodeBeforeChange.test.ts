import type { FieldHookArgs } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as geocodingService from '../services/googleGeocoding.js'
import { createGeocodeBeforeChangeHook } from './geocodeBeforeChange.js'

const MOCK_API_KEY = 'test-api-key'

const MOCK_RESULT = {
  addressComponents: [
    { long_name: 'Berlin', short_name: 'Berlin', types: ['locality'] },
  ],
  formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
  location: { lat: 52.5219, lng: 13.4132 },
  placeId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
  types: ['point_of_interest'],
}

function createMockReq() {
  return {
    payload: {
      config: {
        custom: {
          payloadGeocodingPlugin: {
            googleMapsApiKey: MOCK_API_KEY,
          },
        },
      },
    },
  }
}

function createMockHookArgs(
  overrides: Partial<FieldHookArgs>,
): FieldHookArgs {
  return {
    blockData: undefined,
    collection: null,
    context: {},
    data: {},
    field: {} as any,
    operation: 'create',
    originalDoc: undefined,
    path: [] as any,
    req: createMockReq() as any,
    schemaPath: [] as any,
    siblingData: {},
    value: undefined,
    ...overrides,
  } as FieldHookArgs
}

describe('createGeocodeBeforeChangeHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('geocodes an address string and returns geodata', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const siblingData: Record<string, unknown> = {
      location_address: 'Alexanderplatz, Berlin',
    }

    const result = await hook(
      createMockHookArgs({ siblingData }),
    )

    // Should return the geocoded data for the JSON field
    expect(result).toEqual({
      addressComponents: MOCK_RESULT.addressComponents,
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      location: { lat: 52.5219, lng: 13.4132 },
      placeId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      types: ['point_of_interest'],
    })

    // Should set the point field coordinates [lng, lat]
    expect(siblingData.location).toEqual([13.4132, 52.5219])

    // Should clear the address field
    expect(siblingData.location_address).toBeUndefined()

    // Should have called geocodeAddress with the correct args
    expect(geocodingService.geocodeAddress).toHaveBeenCalledWith(
      'Alexanderplatz, Berlin',
      MOCK_API_KEY,
    )
  })

  it('returns undefined when no address is provided', async () => {
    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const result = await hook(createMockHookArgs({ siblingData: {} }))
    expect(result).toBeUndefined()
  })

  it('returns undefined when address is empty string', async () => {
    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const result = await hook(
      createMockHookArgs({ siblingData: { location_address: '  ' } }),
    )
    expect(result).toBeUndefined()
  })

  it('returns undefined when geocoding returns no results', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([])

    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const result = await hook(
      createMockHookArgs({ siblingData: { location_address: 'xyznonexistent' } }),
    )
    expect(result).toBeUndefined()
  })

  it('throws when API key is not configured', async () => {
    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const reqWithoutKey = {
      payload: { config: { custom: {} } },
    }

    await expect(
      hook(
        createMockHookArgs({
          req: reqWithoutKey as any,
          siblingData: { location_address: 'Berlin' },
        }),
      ),
    ).rejects.toThrow('Geocoding plugin API key not configured')
  })

  it('reads address from data when siblingData does not have it', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const hook = createGeocodeBeforeChangeHook({
      pointFieldName: 'location',
    })

    const siblingData: Record<string, unknown> = {}
    const result = await hook(
      createMockHookArgs({
        data: { location_address: 'Berlin' },
        siblingData,
      }),
    )

    expect(result).toBeDefined()
    expect(result).toHaveProperty('formattedAddress')
  })
})
