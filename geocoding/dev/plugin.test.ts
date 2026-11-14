import payload, { type CollectionSlug, createLocalReq, type SanitizedConfig } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Venue } from './src/payload-types'

import config from './src/payload.config'

type GoogleResult = {
  formatted_address: string
  geometry: { location: { lat: number; lng: number }; location_type: string }
  partial_match?: boolean
  place_id: string
  types: string[]
}

const ALEXANDERPLATZ: GoogleResult = {
  formatted_address: 'Alexanderplatz 1, 10178 Berlin, Germany',
  geometry: { location: { lat: 52.5219, lng: 13.4132 }, location_type: 'ROOFTOP' },
  place_id: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
  types: ['street_address'],
}

const MARIENPLATZ: GoogleResult = {
  formatted_address: 'Marienplatz 1, 80331 München, Germany',
  geometry: { location: { lat: 48.1374, lng: 11.5755 }, location_type: 'ROOFTOP' },
  place_id: 'ChIJ2V-Mo_l1nkcRfZixfUq4DAE',
  types: ['street_address'],
}

const BERLIN_CITY: GoogleResult = {
  formatted_address: 'Berlin, Germany',
  geometry: { location: { lat: 52.52, lng: 13.405 }, location_type: 'APPROXIMATE' },
  place_id: 'ChIJAVkDPzdOqEcRcDteW0YgIQQ',
  types: ['locality', 'political'],
}

/**
 * Stubs the network boundary: answers Google Geocoding API requests by the queried address and
 * records every request URL.
 */
function stubGoogle(answer: (address: string) => { results?: GoogleResult[]; status: string }) {
  const urls: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    urls.push(url)
    return Response.json(answer(url.searchParams.get('address') ?? ''))
  })
  return urls
}

const byAddress =
  (table: Record<string, GoogleResult>) =>
  (address: string): { results?: GoogleResult[]; status: string } => {
    const match = Object.entries(table).find(([key]) => address.includes(key))
    return match ? { results: [match[1]], status: 'OK' } : { results: [], status: 'ZERO_RESULTS' }
  }

/**
 * The Pages collection has `location1` (required point) and `location2` (required point + required meta).
 * These must be provided in every create call to satisfy validation.
 */
const requiredFields = {
  location1: [0, 0] as [number, number],
  location2: [0, 0] as [number, number],
  location2_meta: {
    name: 'Test',
    formattedAddress: 'Test',
    googlePlaceId: 'test',
    types: ['test'],
  },
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
    const meta = {
      name: 'Berlin',
      formattedAddress: 'Berlin, Germany',
      googlePlaceId: 'abc',
      types: ['locality'],
    }
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
    const meta = {
      name: 'Place',
      formattedAddress: 'Somewhere',
      googlePlaceId: 'xyz',
      types: ['locality'],
    }
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
    const metaA = {
      name: 'A',
      formattedAddress: 'Place A',
      googlePlaceId: 'a',
      types: ['locality'],
    }
    const metaB = {
      name: 'B',
      formattedAddress: 'Place B',
      googlePlaceId: 'b',
      types: ['locality'],
    }
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

describe('An address sent in {name}_address', () => {
  beforeEach(async () => await deleteCollection('pages'))

  test('fills the point and meta, and remembers how exact the match is', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Geocoded', location_address: 'Alexanderplatz 1, Berlin', ...requiredFields },
    })

    expect(page.location).toEqual([13.4132, 52.5219])
    expect(page.location_meta).toEqual({
      name: 'Alexanderplatz 1',
      formattedAddress: 'Alexanderplatz 1, 10178 Berlin, Germany',
      googlePlaceId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      partialMatch: false,
      precision: 'exact',
      query: 'Alexanderplatz 1, Berlin',
      types: ['street_address'],
    })
    const stored = await payload.findByID({ collection: 'pages', id: page.id })
    expect(stored).not.toHaveProperty('location_address')
  })

  test('replaces the point on update', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Update', location: [0, 0], ...requiredFields },
    })
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const updated = await payload.update({
      collection: 'pages',
      id: page.id,
      data: { location_address: 'Alexanderplatz 1, Berlin' },
    })

    expect(updated.location).toEqual([13.4132, 52.5219])
  })

  test('refuses the save with the reason when nothing matches', async () => {
    stubGoogle(byAddress({}))

    await expectFieldError(
      payload.create({
        collection: 'pages',
        data: { title: 'Nowhere', location_address: 'Nowhere Street 99', ...requiredFields },
      }),
      /No place matches "Nowhere Street 99"/,
    )
  })

  test('refuses the save naming the server key option when Google refuses the key', async () => {
    stubGoogle(() => ({ status: 'REQUEST_DENIED' }))

    await expectFieldError(
      payload.create({
        collection: 'pages',
        data: { title: 'Denied', location_address: 'Alexanderplatz 1, Berlin', ...requiredFields },
      }),
      /googleServerApiKey/,
    )
  })

  test('does not call Google when no address is sent', async () => {
    const urls = stubGoogle(byAddress({}))

    await payload.create({
      collection: 'pages',
      data: { title: 'No address', location: [1, 2], ...requiredFields },
    })

    expect(urls).toHaveLength(0)
  })
})

describe('A point filled from the document address (address option)', () => {
  beforeEach(async () => await deleteCollection('venues'))

  /** Venue data without coordinates: the hook fills them, so the generated type is too strict. */
  const createVenue = (
    data: Omit<Venue, 'coordinates' | 'createdAt' | 'id' | 'updatedAt'> & {
      coordinates?: [number, number]
    },
  ) => payload.create({ collection: 'venues', data: data as Venue })

  const berlin = {
    name: 'Venue',
    street: 'Alexanderplatz 1',
    postalCode: '10178',
    city: 'Berlin',
    country: 'de',
  }

  test('fills itself from the address fields, restricted to the country', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const venue = await createVenue(berlin)

    expect(venue.coordinates).toEqual([13.4132, 52.5219])
    expect(urls[0].searchParams.get('address')).toBe('Alexanderplatz 1, 10178 Berlin')
    expect(urls[0].searchParams.get('components')).toBe('country:DE')
  })

  test('keeps coordinates someone entered and never calls Google', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const venue = await createVenue({ ...berlin, coordinates: [13.0, 52.0] })

    expect(venue.coordinates).toEqual([13.0, 52.0])
    expect(urls).toHaveLength(0)
  })

  test('re-geocodes a geocoded point when the address changes', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const venue = await createVenue(berlin)

    const moved = await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { street: 'Marienplatz 1', postalCode: '80331', city: 'München' },
    })

    expect(moved.coordinates).toEqual([11.5755, 48.1374])
  })

  test('leaves an entered point alone when the address changes', async () => {
    const urls = stubGoogle(byAddress({ Marienplatz: MARIENPLATZ }))
    const venue = await createVenue({ ...berlin, coordinates: [13.0, 52.0] })

    const moved = await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { street: 'Marienplatz 1', postalCode: '80331', city: 'München' },
    })

    expect(moved.coordinates).toEqual([13.0, 52.0])
    expect(urls).toHaveLength(0)
  })

  test('leaves a point alone once someone replaced the geocoded one', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const venue = await createVenue(berlin)
    await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { coordinates: [13.1, 52.1] },
    })

    const moved = await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { street: 'Marienplatz 1', postalCode: '80331', city: 'München' },
    })

    expect(moved.coordinates).toEqual([13.1, 52.1])
  })

  test('refuses a city-level match with the reason instead of storing it', async () => {
    stubGoogle(() => ({ results: [BERLIN_CITY], status: 'OK' }))

    await expectFieldError(createVenue(berlin), /only approximate.*needs interpolated/)
  })

  test('refuses the save with the reason when Google is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expectFieldError(
      createVenue(berlin),
      /Google could not be reached \(fetch failed\)\. Retry later/,
    )
  })

  test('geocodes each document of a bulk update with its own address', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const a = await createVenue({ ...berlin, name: 'A' })
    const b = await createVenue({
      ...berlin,
      name: 'B',
      street: 'Marienplatz 1',
      postalCode: '80331',
      city: 'München',
    })

    await payload.update({
      collection: 'venues',
      where: { id: { in: [a.id, b.id] } },
      // Changes both addresses at once, so both points re-geocode within one request.
      data: { postalCode: '' },
    })
    const [storedA, storedB] = await Promise.all([
      payload.findByID({ collection: 'venues', id: a.id }),
      payload.findByID({ collection: 'venues', id: b.id }),
    ])
    expect(storedA.coordinates).toEqual([13.4132, 52.5219])
    expect(storedB.coordinates).toEqual([11.5755, 48.1374])
  })
})

describe('Geocoding field inside a Lexical block', () => {
  beforeEach(async () => await deleteCollection('articles'))

  const article = (fields: Record<string, unknown>) => ({
    title: 'Article',
    content: {
      root: {
        type: 'root',
        version: 1,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        children: [
          {
            type: 'block',
            version: 1,
            fields: { id: 'b1', blockType: 'locationBlock', ...fields },
          },
        ],
      },
    },
  })

  const firstBlock = (doc: { content?: unknown }): Record<string, unknown> => {
    const content = doc.content as {
      root: { children: Array<{ fields: Record<string, unknown> }> }
    }
    return content.root.children[0].fields
  }

  test('stores point and meta set directly', async () => {
    const meta = {
      name: 'Berlin',
      formattedAddress: 'Berlin, Germany',
      googlePlaceId: 'abc',
      types: ['locality'],
    }
    const doc = await payload.create({
      collection: 'articles',
      data: article({ location: [13.4132, 52.5219], location_meta: meta }),
    })

    expect(firstBlock(doc).location).toEqual([13.4132, 52.5219])
    expect(firstBlock(doc).location_meta).toEqual(meta)
  })

  test('geocodes an address sent in the block once, without storing it', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const doc = await payload.create({
      collection: 'articles',
      data: article({ location_address: 'Alexanderplatz 1, Berlin' }),
    })
    await payload.update({ collection: 'articles', id: doc.id, data: { title: 'Renamed' } })

    expect(firstBlock(doc).location).toEqual([13.4132, 52.5219])
    expect(firstBlock(doc).location_address).toBeUndefined()
    expect(urls).toHaveLength(1)
  })
})

describe('GET /api/geocoding/search', () => {
  const endpoint = () => {
    const found = payload.config.endpoints.find((e) => e.path === '/geocoding/search')
    if (!found) throw new Error('endpoint not registered')
    return found
  }

  const call = async (query: string, user: unknown = { id: 1, collection: 'users' }) => {
    const req = await createLocalReq(
      { urlSuffix: `/api/geocoding/search${query}`, user: user as never },
      payload,
    )
    const response = await endpoint().handler(req)
    return { body: await response.json(), status: response.status }
  }

  test('answers the matches for an address', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const { body, status } = await call('?q=Alexanderplatz+1,+Berlin&country=de&language=de')

    expect(status).toBe(200)
    expect(body.results[0]).toMatchObject({
      location: { lat: 52.5219, lng: 13.4132 },
      placeId: 'ChIJp1l4uWBRqEcR2SPNRBMhtAI',
      precision: 'exact',
    })
    expect(urls[0].searchParams.get('components')).toBe('country:DE')
    expect(urls[0].searchParams.get('language')).toBe('de')
  })

  test('refuses anonymous callers', async () => {
    const { status } = await call('?q=Berlin', null)
    expect(status).toBe(401)
  })

  test('explains the parameters when q is missing', async () => {
    const { body, status } = await call('')
    expect(status).toBe(400)
    expect(body.errors[0].message).toMatch(/q=Alexanderplatz/)
  })

  test('answers an empty list with a hint when nothing matches', async () => {
    stubGoogle(byAddress({}))
    const { body, status } = await call('?q=Nowhere')
    expect(status).toBe(200)
    expect(body).toMatchObject({ results: [], message: expect.stringMatching(/postal code/) })
  })

  test('answers the reason when Google refuses the key', async () => {
    stubGoogle(() => ({ status: 'REQUEST_DENIED' }))
    const { body, status } = await call('?q=Berlin')
    expect(status).toBe(502)
    expect(body.reason).toBe('denied')
  })
})

// --- Helpers ---

/** Asserts a save fails validation and that a field's error message (what REST returns) matches. */
async function expectFieldError(save: Promise<unknown>, message: RegExp) {
  const error: unknown = await save.then(
    () => undefined,
    (e: unknown) => e,
  )
  const errors = (error as { data?: { errors?: Array<{ message: string }> } })?.data?.errors ?? []
  expect(errors.map((e) => e.message).join('\n')).toMatch(message)
}

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
