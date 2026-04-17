import { geocodingField } from '../../../src/fields/geocodingField.js'

import { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    // These fields are used for testing the plugin:

    // Minimal field config - not required
    geocodingField({
      pointField: {
        name: 'location',
        type: 'point',
      },
    }),

    // readOnly field
    geocodingField({
      pointField: {
        name: 'location0',
        type: 'point',
        required: false,
        admin: {
          readOnly: true,
        },
      },
    }),

    // Minimal field config - required
    geocodingField({
      pointField: {
        name: 'location1',
        type: 'point',
        required: true,
      },
    }),

    // Minimal field config - required
    geocodingField({
      pointField: {
        name: 'location2',
        type: 'point',
        required: true,
      },
      geoDataFieldOverride: {
        required: true,
      },
    }),

    // With geoDataFieldOverride
    geocodingField({
      pointField: {
        name: 'location3',
        type: 'point',
      },
      geoDataFieldOverride: {
        label: 'Geodata (Custom label)',
        access: {
          read: () => true,
          update: () => true,
          create: () => true,
        },
        admin: {
          readOnly: false,
        },
      },
    }),

    // Usage inside a group
    {
      name: 'locationGroup',
      type: 'group',
      fields: [
        geocodingField({
          pointField: {
            name: 'location',
            type: 'point',
          },
        }),
      ],
    },

    // Usage inside an array
    {
      name: 'locations',
      type: 'array',
      fields: [
        geocodingField({
          pointField: {
            name: 'location',
            type: 'point',
          },
        }),
      ],
    },
  ],
}
