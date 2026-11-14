import type { CollectionConfig } from 'payload'

import type { GeocodingAddressArgs } from '../../../src/types/GeoCodingFieldConfig'

import { geocodingField } from '../../../src/fields/geocodingField'

/** The venue's address as one line, or undefined while street or city is missing. */
export const venueAddress = ({ siblingData }: GeocodingAddressArgs) => {
  const { city, country, postalCode, street } = siblingData
  if (typeof street !== 'string' || typeof city !== 'string' || !street || !city) {
    return undefined
  }
  return {
    address: [street, [postalCode, city].filter(Boolean).join(' ')].join(', '),
    country: typeof country === 'string' && country ? country : undefined,
  }
}

/**
 * Demonstrates the `address` option: the coordinates fill themselves from the address fields on
 * save, and only street-level matches are stored.
 */
export const Venues: CollectionConfig = {
  slug: 'venues',
  admin: {
    useAsTitle: 'name',
  },
  versions: { drafts: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'street', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'postalCode', type: 'text' },
        { name: 'city', type: 'text' },
        {
          name: 'country',
          type: 'text',
          admin: { description: 'ISO 3166-1 alpha-2 code, e.g. DE' },
        },
      ],
    },
    geocodingField({
      address: venueAddress,
      minPrecision: 'interpolated',
      pointField: {
        name: 'coordinates',
        type: 'point',
        required: true,
      },
    }),
  ],
}

/** Optional point from an address: stays empty when the address cannot be geocoded. */
export const Spots: CollectionConfig = {
  slug: 'spots',
  fields: [
    { name: 'name', type: 'text' },
    { name: 'street', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'country', type: 'text' },
    geocodingField({
      address: venueAddress,
      pointField: {
        name: 'location',
        type: 'point',
      },
    }),
  ],
}
