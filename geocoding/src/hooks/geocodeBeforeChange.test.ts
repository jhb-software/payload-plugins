import type { FieldHookArgs } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as geocodingService from '../services/googleGeocoding.js'
import { createGeoDataBeforeChangeHook, createPointBeforeChangeHook } from './geocodeBeforeChange.js'

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

describe('createGeoDataBeforeChangeHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('geocodes an address string and returns geodata', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const hook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })

    const result = await hook(
      createMockHookArgs({
        siblingData: { location_address: 'Alexanderplatz, Berlin' },
      }),
    )

    expect(result).toEqual({
      addressComponents: MOCK_RESULT.addressComponents,
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      location: { lat: 52.5219, lng: 13.4132 },
      placeId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      types: ['point_of_interest'],
    })
  })

  it('returns undefined when no address is provided', async () => {
    const hook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(createMockHookArgs({ siblingData: {} }))
    expect(result).toBeUndefined()
  })

  it('returns undefined when address is empty string', async () => {
    const hook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(
      createMockHookArgs({ siblingData: { location_address: '  ' } }),
    )
    expect(result).toBeUndefined()
  })

  it('returns undefined when geocoding returns no results', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([])
    const hook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(
      createMockHookArgs({ siblingData: { location_address: 'xyznonexistent' } }),
    )
    expect(result).toBeUndefined()
  })

  it('throws when API key is not configured', async () => {
    const hook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })
    await expect(
      hook(
        createMockHookArgs({
          req: { payload: { config: { custom: {} } } } as any,
          siblingData: { location_address: 'Berlin' },
        }),
      ),
    ).rejects.toThrow('Geocoding plugin API key not configured')
  })
})

describe('createPointBeforeChangeHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [lng, lat] from geocoded address', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const hook = createPointBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(
      createMockHookArgs({
        siblingData: { location_address: 'Berlin' },
      }),
    )

    expect(result).toEqual([13.4132, 52.5219])
  })

  it('returns existing value when no address is provided', async () => {
    const hook = createPointBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(
      createMockHookArgs({ siblingData: {}, value: [1, 2] }),
    )
    expect(result).toEqual([1, 2])
  })

  it('shares cached geocoding result via context', async () => {
    const geocodeSpy = vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const context: Record<string, unknown> = {}
    const hookArgs = { context, siblingData: { location_address: 'Berlin' } }

    const geoDataHook = createGeoDataBeforeChangeHook({ pointFieldName: 'location' })
    const pointHook = createPointBeforeChangeHook({ pointFieldName: 'location' })

    // Run both hooks concurrently (simulating Payload's parallel field processing)
    const [geoDataResult, pointResult] = await Promise.all([
      geoDataHook(createMockHookArgs(hookArgs)),
      pointHook(createMockHookArgs(hookArgs)),
    ])

    expect(geoDataResult).toHaveProperty('formattedAddress')
    expect(pointResult).toEqual([13.4132, 52.5219])

    // geocodeAddress should only be called once due to caching
    expect(geocodeSpy).toHaveBeenCalledTimes(1)
  })
})
