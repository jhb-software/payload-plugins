import type { CollectionConfig } from 'payload'

export const Countries: CollectionConfig = {
  slug: 'countries',
  admin: {
    useAsTitle: 'title',
  },
  custom: {
    pagesPlugin: {
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
