import type { FieldHookArgs } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as geocodingService from '../services/googleGeocoding.js'
import { createMetaBeforeChangeHook, createPointBeforeChangeHook } from './geocodeBeforeChange.js'

const MOCK_API_KEY = 'test-api-key'

const MOCK_RESULT = {
  name: 'Alexanderplatz',
  formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
  googlePlaceId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
  location: { lat: 52.5219, lng: 13.4132 },
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

function createMockHookArgs(overrides: Partial<FieldHookArgs>): FieldHookArgs {
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

describe('createMetaBeforeChangeHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('geocodes an address string and returns location metadata', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const hook = createMetaBeforeChangeHook({ pointFieldName: 'location' })

    const result = await hook(
      createMockHookArgs({
        siblingData: { location_address: 'Alexanderplatz, Berlin' },
      }),
    )

    expect(result).toEqual({
      name: 'Alexanderplatz',
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      googlePlaceId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      types: ['point_of_interest'],
    })
  })

  it('returns undefined when no address is provided', async () => {
    const hook = createMetaBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(createMockHookArgs({ siblingData: {} }))
    expect(result).toBeUndefined()
  })

  it('returns undefined when address is empty string', async () => {
    const hook = createMetaBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(createMockHookArgs({ siblingData: { location_address: '  ' } }))
    expect(result).toBeUndefined()
  })

  it('returns undefined when geocoding returns no results', async () => {
    vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([])
    const hook = createMetaBeforeChangeHook({ pointFieldName: 'location' })
    const result = await hook(
      createMockHookArgs({ siblingData: { location_address: 'xyznonexistent' } }),
    )
    expect(result).toBeUndefined()
  })

  it('throws when API key is not configured', async () => {
    const hook = createMetaBeforeChangeHook({ pointFieldName: 'location' })
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
    const result = await hook(createMockHookArgs({ siblingData: {}, value: [1, 2] }))
    expect(result).toEqual([1, 2])
  })

  it('shares cached geocoding result via context', async () => {
    const geocodeSpy = vi.spyOn(geocodingService, 'geocodeAddress').mockResolvedValue([MOCK_RESULT])

    const context: Record<string, unknown> = {}
    const hookArgs = { context, siblingData: { location_address: 'Berlin' } }

    const metaHook = createMetaBeforeChangeHook({ pointFieldName: 'location' })
    const pointHook = createPointBeforeChangeHook({ pointFieldName: 'location' })

    const [metaResult, pointResult] = await Promise.all([
      metaHook(createMockHookArgs(hookArgs)),
      pointHook(createMockHookArgs(hookArgs)),
    ])

    expect(metaResult).toHaveProperty('formattedAddress')
    expect(pointResult).toEqual([13.4132, 52.5219])
    expect(geocodeSpy).toHaveBeenCalledTimes(1)
  })
})
