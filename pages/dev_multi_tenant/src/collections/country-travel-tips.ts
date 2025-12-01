import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const CountryTravelTips: PageCollectionConfig = {
  slug: 'country-travel-tips',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'countries',
      name: 'country',
    },
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup (see indexes below)
      unique: false,
      staticValue: 'reisetipps',
    },
  },
  indexes: [
    {
      fields: ['slug', 'tenant'],
      unique: true,
    },
  ],
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
