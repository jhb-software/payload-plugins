import type { CollectionConfig } from 'payload'

export const CountryTravelTips: CollectionConfig = {
  slug: 'country-travel-tips',
  admin: {
    useAsTitle: 'title',
  },
  custom: {
    pagesPlugin: {
      page: {
        parent: {
          collection: 'countries',
          name: 'country',
        },
        slug: {
          unique: false,
          staticValue: 'reisetipps',
        },
      },
    },
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
}
