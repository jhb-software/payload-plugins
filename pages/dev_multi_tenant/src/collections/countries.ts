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
      // Disable the slug uniqueness because of the multi-tenant setup (see indexes below)
      unique: false,
    },
  },
  versions: {
    drafts: true,
  },
  indexes: [
    {
      fields: ['slug', 'tenant'],
      unique: true,
    },
  ],
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
