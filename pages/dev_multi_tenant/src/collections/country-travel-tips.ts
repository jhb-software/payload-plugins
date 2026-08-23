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
      // Disable the slug uniqueness because of the multi-tenant setup. A compound
      // ['slug', 'tenant'] index is not an option here: the SQL adapters reject a compound index
      // mixing the localized `slug` with the unlocalized `tenant`.
      unique: false,
      staticValue: 'reisetipps',
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
