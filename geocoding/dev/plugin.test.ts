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
    expect(stored.location_address).toBeNull()
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

  test('refuses the update when the address fails on a document that already has a point', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Has a point', location: [1, 2], ...requiredFields },
    })
    stubGoogle(byAddress({}))

    await expectFieldError(
      payload.update({
        collection: 'pages',
        id: page.id,
        data: { location_address: 'Nowhere 99' },
      }),
      /No place matches "Nowhere 99"/,
    )
    const stored = await payload.findByID({ collection: 'pages', id: page.id })
    expect(stored.location).toEqual([1, 2])
  })

  test('gives each of several documents created on one request its own point', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const req = await createLocalReq({}, payload)

    const berlin = await payload.create({
      collection: 'pages',
      data: { title: 'Berlin', location_address: 'Alexanderplatz 1, Berlin', ...requiredFields },
      req,
    })
    const munich = await payload.create({
      collection: 'pages',
      data: { title: 'Munich', location_address: 'Marienplatz 1, München', ...requiredFields },
      req,
    })
    const moved = await payload.update({
      collection: 'pages',
      id: berlin.id,
      data: { location_address: 'Marienplatz 1, München' },
      req,
    })

    expect(berlin.location).toEqual([13.4132, 52.5219])
    expect(munich.location).toEqual([11.5755, 48.1374])
    expect(moved.location).toEqual([11.5755, 48.1374])
  })

  test('refuses the address when the caller may not set the point', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Locked',
        lockedLocation_address: 'Alexanderplatz 1, Berlin',
        ...requiredFields,
      },
      overrideAccess: false,
      user: { id: 1, collection: 'users' } as never,
    })

    expect(page.lockedLocation).toBeFalsy()
    expect(urls).toHaveLength(0)
  })

  test('replacing the point through the API clears the place that described the old one', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Replace', location_address: 'Alexanderplatz 1, Berlin', ...requiredFields },
    })

    const updated = await payload.update({
      collection: 'pages',
      id: page.id,
      data: { location: [10, 50] },
    })

    expect(updated.location).toEqual([10, 50])
    expect(updated.location_meta).toBeNull()
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
  const createVenue = (data: Partial<Venue> & { name: string }) =>
    payload.create({ collection: 'venues', data: { _status: 'published', ...data } })

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

  test('re-geocodes when only the country changes', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))
    const venue = await createVenue({ ...berlin, country: 'AT' })

    await payload.update({ collection: 'venues', id: venue.id, data: { country: 'DE' } })

    expect(urls.map((url) => url.searchParams.get('components'))).toEqual([
      'country:AT',
      'country:DE',
    ])
  })

  test('keeps a point set through {name}_address when an unrelated field changes', async () => {
    const urls = stubGoogle(byAddress({ Adlon: ALEXANDERPLATZ, Alexanderplatz: MARIENPLATZ }))
    const venue = await createVenue({ ...berlin, coordinates_address: 'Hotel Adlon, Berlin' })

    const renamed = await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { name: 'Renamed' },
    })

    expect(renamed.coordinates).toEqual([13.4132, 52.5219])
    expect(urls).toHaveLength(1)
  })

  test('saves a draft whose address cannot be geocoded yet, without an error', async () => {
    stubGoogle(byAddress({}))

    const draft = await payload.create({
      collection: 'venues',
      data: { ...berlin, street: 'Alexanderpl' },
      draft: true,
    })

    expect(draft.coordinates).toBeFalsy()
  })

  test('refuses a failed {name}_address even in a draft, so an agent learns why', async () => {
    stubGoogle(byAddress({}))

    await expectFieldError(
      payload.create({
        collection: 'venues',
        data: { name: 'Draft', coordinates_address: 'Nowhere 99' },
        draft: true,
      }),
      /No place matches "Nowhere 99"/,
    )
  })

  test('refuses to publish a venue without coordinates, saying how to provide them', async () => {
    await expectFieldError(
      createVenue({ name: 'No address' }),
      /coordinates is required: set the coordinates, or complete the address/,
    )
  })

  test('lets the admin form submit a venue whose coordinates are still to be geocoded', async () => {
    const field = (await config).collections
      .find((collection) => collection.slug === 'venues')
      ?.flattenedFields.find((f) => f.name === 'coordinates')
    if (!field || !('validate' in field) || !field.validate) throw new Error('no validate')
    const req = await createLocalReq({}, payload)

    // The form's own validation runs before the save hooks can fill the point.
    expect(await field.validate(undefined, { ...field, req } as never)).toBe(true)
  })

  test('geocodes on publish an address the admin panel already autosaved', async () => {
    const urls = stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))
    const draft = await payload.create({ collection: 'venues', data: { name: 'V' }, draft: true })
    const autosaveReq = await createLocalReq({}, payload)
    autosaveReq.query = { autosave: 'true' }
    await payload.update({
      collection: 'venues',
      id: draft.id,
      data: { street: 'Alexanderplatz 1', city: 'Berlin', country: 'DE' },
      draft: true,
      req: autosaveReq,
    })
    expect(urls).toHaveLength(0)

    const published = await payload.update({
      collection: 'venues',
      id: draft.id,
      data: { _status: 'published' },
    })

    expect(published.coordinates).toEqual([13.4132, 52.5219])
  })

  test('retries an empty point once Google is reachable again', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'))
    const draft = await payload.create({ collection: 'venues', data: berlin, draft: true })
    expect(draft.coordinates).toBeFalsy()
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))

    const published = await payload.update({
      collection: 'venues',
      id: draft.id,
      data: { _status: 'published' },
    })

    expect(published.coordinates).toEqual([13.4132, 52.5219])
  })

  test('keeps the pin when Google is down while the address changes', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ }))
    const venue = await createVenue(berlin)
    vi.restoreAllMocks()
    stubGoogle(() => ({ status: 'OVER_QUERY_LIMIT' }))

    const draft = await payload.update({
      collection: 'venues',
      id: venue.id,
      data: { street: 'Marienplatz 1', city: 'München' },
      draft: true,
    })

    expect(draft.coordinates).toEqual([13.4132, 52.5219])
  })

  test('restricts an address sent in {name}_address to the country of the document', async () => {
    const urls = stubGoogle(byAddress({ Adlon: ALEXANDERPLATZ }))

    await createVenue({ ...berlin, country: 'DE', coordinates_address: 'Hotel Adlon, Berlin' })

    expect(urls[0].searchParams.get('components')).toBe('country:DE')
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

describe('An optional point filled from the document address', () => {
  beforeEach(async () => await deleteCollection('spots'))

  test('stays empty when the address cannot be geocoded, without refusing the save', async () => {
    const urls = stubGoogle(byAddress({}))

    const spot = await payload.create({
      collection: 'spots',
      data: { name: 'Spot', street: 'Nowhere 99', city: 'Berlin' },
    })
    await payload.update({ collection: 'spots', id: spot.id, data: { name: 'Renamed' } })

    const stored = await payload.findByID({ collection: 'spots', id: spot.id })
    expect(stored.location).toBeFalsy()
    expect(stored.name).toBe('Renamed')
    expect(urls.length).toBeGreaterThan(0)
  })
})

describe('A localized point', () => {
  beforeEach(async () => await deleteCollection('tours'))

  test('keeps a place per locale', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const tour = await payload.create({
      collection: 'tours',
      data: { title: 'Tour', meetingPoint_address: 'Alexanderplatz 1, Berlin' },
      locale: 'en',
    })
    await payload.update({
      collection: 'tours',
      id: tour.id,
      data: { meetingPoint_address: 'Marienplatz 1, München' },
      locale: 'de',
    })

    const en = await payload.findByID({ collection: 'tours', id: tour.id, locale: 'en' })
    const de = await payload.findByID({ collection: 'tours', id: tour.id, locale: 'de' })
    expect(en.meetingPoint_meta?.query).toBe('Alexanderplatz 1, Berlin')
    expect(de.meetingPoint_meta?.query).toBe('Marienplatz 1, München')
  })

  test('saving all locales at once neither geocodes nor breaks', async () => {
    const urls = stubGoogle(byAddress({}))
    const tour = await payload.create({
      collection: 'tours',
      data: { title: 'Tour', meetingPoint: [1, 2] },
      locale: 'en',
    })

    // A save with `locale: 'all'` carries every localized field as a locale-keyed object.
    const allLocales = { title: { en: 'Tour', de: 'Tour DE' } } as never
    await payload.update({
      collection: 'tours',
      id: tour.id,
      data: allLocales,
      locale: 'all' as never,
    })

    expect(urls).toHaveLength(0)
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
    expect(firstBlock(doc).location_address).toBeNull()
    expect(urls).toHaveLength(1)
  })
  test('geocodes each of two location blocks with its own address', async () => {
    stubGoogle(byAddress({ Alexanderplatz: ALEXANDERPLATZ, Marienplatz: MARIENPLATZ }))
    const block = (id: string, address: string) => ({
      type: 'block',
      version: 1,
      fields: { id, blockType: 'locationBlock', location_address: address },
    })
    const data = article({})
    data.content.root.children = [
      block('b1', 'Alexanderplatz 1, Berlin'),
      block('b2', 'Marienplatz 1, München'),
    ]

    const doc = await payload.create({ collection: 'articles', data })
    const blocks = [0, 1].map((index) =>
      firstBlock({ content: { root: { children: [doc.content?.root.children[index]] } } }),
    )

    expect(blocks.map((b) => b.location)).toEqual([
      [13.4132, 52.5219],
      [11.5755, 48.1374],
    ])
    expect(blocks.map((b) => b.location_address)).toEqual([null, null])
  })

  test('refuses an address in a block that cannot be geocoded', async () => {
    stubGoogle(byAddress({}))

    await expectFieldError(
      payload.create({ collection: 'articles', data: article({ location_address: 'Nowhere 99' }) }),
      /No place matches "Nowhere 99"/,
    )
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

  test('refuses users outside the admin user collection, so a customer signup cannot spend quota', async () => {
    const { status } = await call('?q=Berlin', { id: 1, collection: 'customers' })
    expect(status).toBe(403)
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
