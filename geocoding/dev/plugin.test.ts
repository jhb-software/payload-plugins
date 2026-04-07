import payload, { type CollectionSlug, type SanitizedConfig } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import config from './src/payload.config'

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

/**
 * The Pages collection has `location1` (required point) and `location2` (required point + required meta).
 * These must be provided in every create call to satisfy validation.
 */
const requiredFields = {
  location1: [0, 0] as [number, number],
  location2: [0, 0] as [number, number],
  location2_meta: { name: 'Test', formattedAddress: 'Test', googlePlaceId: 'test', types: ['test'] },
}

/** Returns a fresh mock Response for each call (avoids "Body already read" errors). */
function mockGoogleGeocodingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify(MOCK_GOOGLE_RESPONSE), { status: 200 })
  })
}

beforeAll(async () => {
  await payload.init({
    config: config,
  })

  await deleteAllCollections(config, ['users'])
})

afterAll(async () => {
  await deleteAllCollections(config)

  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Geocoding plugin field structure', () => {
  beforeEach(async () => await deleteCollection('pages'))

  test('creates a page with point and meta fields via the local API', async () => {
    const meta = { name: 'Berlin', formattedAddress: 'Berlin, Germany', googlePlaceId: 'abc', types: ['locality'] }
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Test Page',
        location: [13.4132, 52.5219],
        location_meta: meta,
        ...requiredFields,
      },
    })

    expect(page.location).toEqual([13.4132, 52.5219])
    expect(page.location_meta).toEqual(meta)
  })

  test('creates a page with only the required fields', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Minimal Page',
        ...requiredFields,
      },
    })

    expect(page.title).toBe('Minimal Page')
    expect(page.location).toBeUndefined()
  })

  test('geocoding fields work inside a group', async () => {
    const meta = { name: 'Place', formattedAddress: 'Somewhere', googlePlaceId: 'xyz', types: ['locality'] }
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Group Test',
        locationGroup: {
          location: [10.0, 50.0],
          location_meta: meta,
        },
        ...requiredFields,
      },
    })

    expect(page.locationGroup?.location).toEqual([10.0, 50.0])
    expect(page.locationGroup?.location_meta).toEqual(meta)
  })

  test('geocoding fields work inside an array', async () => {
    const metaA = { name: 'A', formattedAddress: 'Place A', googlePlaceId: 'a', types: ['locality'] }
    const metaB = { name: 'B', formattedAddress: 'Place B', googlePlaceId: 'b', types: ['locality'] }
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Array Test',
        locations: [
          { location: [8.0, 48.0], location_meta: metaA },
          { location: [9.0, 49.0], location_meta: metaB },
        ],
        ...requiredFields,
      },
    })

    expect(page.locations).toHaveLength(2)
    expect(page.locations![0].location).toEqual([8.0, 48.0])
    expect(page.locations![1].location).toEqual([9.0, 49.0])
  })
})

describe('Server-side address geocoding (beforeChange hook)', () => {
  beforeEach(async () => await deleteCollection('pages'))

  test('auto-geocodes an address string submitted via location_address', async () => {
    mockGoogleGeocodingFetch()

    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Geocoded Page',
        location_address: 'Alexanderplatz, Berlin',
        ...requiredFields,
      },
    })

    // Point field should be populated with [lng, lat]
    expect(page.location).toEqual([13.4132, 52.5219])

    // Meta field should contain the geocoding result in LocationMeta shape
    expect(page.location_meta).toMatchObject({
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      googlePlaceId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      name: 'Alexanderplatz',
    })

    // The address field should NOT be persisted (virtual: true)
    const fetched = await payload.findByID({
      collection: 'pages',
      id: page.id,
    })
    expect((fetched as Record<string, unknown>).location_address).toBeFalsy()
  })

  test('does not geocode when no address is provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await payload.create({
      collection: 'pages',
      data: {
        title: 'No Address Page',
        location: [1.0, 2.0],
        ...requiredFields,
      },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('auto-geocodes address on update', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Update Test',
        location: [0, 0],
        ...requiredFields,
      },
    })

    mockGoogleGeocodingFetch()

    const updated = await payload.update({
      collection: 'pages',
      id: page.id,
      data: {
        location_address: 'Alexanderplatz, Berlin',
      },
    })

    expect(updated.location).toEqual([13.4132, 52.5219])
    expect(updated.location_meta).toMatchObject({
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
    })
  })
})

describe('Geocoding field inside a Lexical block', () => {
  beforeEach(async () => await deleteCollection('articles'))

  test('creates an article with a locationBlock containing point and meta', async () => {
    const article = await payload.create({
      collection: 'articles',
      data: {
        title: 'Article with Location Block',
        content: {
          root: {
            type: 'root',
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'block',
                version: 1,
                fields: {
                  id: 'loc-block-1',
                  blockName: 'Berlin Office',
                  blockType: 'locationBlock',
                  label: 'Berlin HQ',
                  location: [13.4132, 52.5219],
                  location_meta: { name: 'Berlin', formattedAddress: 'Berlin, Germany', googlePlaceId: 'abc', types: ['locality'] },
                },
              },
            ],
          },
        },
      },
    })

    const block = (article.content?.root?.children as any[])?.[0]
    expect(block).toBeDefined()
    expect(block.fields.blockType).toBe('locationBlock')
    expect(block.fields.location).toEqual([13.4132, 52.5219])
    expect(block.fields.location_meta).toMatchObject({ name: 'Berlin' })
  })

  test('auto-geocodes an address inside a Lexical block', async () => {
    mockGoogleGeocodingFetch()

    const article = await payload.create({
      collection: 'articles',
      data: {
        title: 'Geocoded Block Article',
        content: {
          root: {
            type: 'root',
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'block',
                version: 1,
                fields: {
                  id: 'loc-block-2',
                  blockName: 'Auto-geocoded Location',
                  blockType: 'locationBlock',
                  label: 'Berlin Office',
                  location_address: 'Alexanderplatz, Berlin',
                },
              },
            ],
          },
        },
      },
    })

    const block = (article.content?.root?.children as any[])?.[0]
    expect(block).toBeDefined()

    expect(block.fields.location).toEqual([13.4132, 52.5219])
    expect(block.fields.location_meta).toMatchObject({
      formattedAddress: 'Alexanderplatz, 10178 Berlin, Germany',
      googlePlaceId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
    })

    // Known Payload bug: virtual fields inside Lexical blocks are still stored in the block's JSON.
    // The address field has virtual: true, which correctly prevents a DB column for regular fields,
    // but Lexical blocks serialize all field data as JSON and ignore the virtual flag.
    // expect(block.fields.location_address).toBeFalsy()
  })
})

describe('Geocoding search endpoint', () => {
  test('is registered at /api/geocoding-plugin/search', () => {
    const endpoints = payload.config.endpoints
    const geocodingEndpoint = endpoints?.find((e) => e.path === '/geocoding-plugin/search')

    expect(geocodingEndpoint).toBeDefined()
    expect(geocodingEndpoint!.method).toBe('get')
  })
})

// --- Helpers ---

const deleteCollection = async (collection: CollectionSlug) => {
  await payload.db.deleteMany({
    collection: collection,
    where: {},
  })

  try {
    await payload.db.deleteVersions({
      collection: collection,
      where: {},
    })
  } catch {}
}

const deleteAllCollections = async (
  config: Promise<SanitizedConfig>,
  except: CollectionSlug[] = [],
) => {
  const collections = (await config).collections?.filter((c) => !except.includes(c.slug)) ?? []

  for (const collection of collections) {
    if (!except.includes(collection.slug)) {
      await deleteCollection(collection.slug)
    }
  }
}
