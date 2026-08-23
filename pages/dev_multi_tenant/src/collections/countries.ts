import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Countries: PageCollectionConfig = {
  slug: 'countries',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
      sharedDocument: true,
    },
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup. A compound
      // ['slug', 'tenant'] index is not an option here: the SQL adapters reject a compound index
      // mixing the localized `slug` with the unlocalized `tenant`.
      unique: false,
    },
  },
  versions: {
    drafts: true,
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
