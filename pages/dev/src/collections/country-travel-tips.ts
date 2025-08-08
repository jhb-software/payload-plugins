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
      unique: false,
      staticValue: {
        de: 'reisetipps',
        en: 'travel-tips',
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
      localized: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      localized: true,
    },
  ],
}
