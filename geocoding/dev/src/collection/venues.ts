import type { CollectionConfig } from 'payload'

import { geocodingField } from '../../../src/fields/geocodingField'

/**
 * Demonstrates the `address` option: the coordinates fill themselves from the address fields on
 * save, and only street-level matches are stored.
 */
export const Venues: CollectionConfig = {
  slug: 'venues',
  admin: {
    useAsTitle: 'name',
  },
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
      address: ({ siblingData }) => {
        const { city, country, postalCode, street } = siblingData
        if (typeof street !== 'string' || typeof city !== 'string' || !street || !city) {
          return undefined
        }
        return {
          address: [street, [postalCode, city].filter(Boolean).join(' ')].join(', '),
          country: typeof country === 'string' ? country : undefined,
        }
      },
      minPrecision: 'interpolated',
      pointField: {
        name: 'coordinates',
        type: 'point',
        required: true,
      },
    }),
  ],
}
