import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
  },
  custom: {
    pagesPlugin: {
      page: {
        parent: {
          collection: 'pages',
          name: 'parent',
          sharedDocument: true,
        },
        breadcrumbs: {
          labelField: 'name',
        },
        slug: {
          // Disable the slug uniqueness because of the multi-tenant setup (see indexes below)
          unique: false,
        },
      },
    },
  },
  indexes: [
    {
      fields: ['slug', 'tenant'],
      unique: true,
    },
  ],
  fields: [
    {
      name: 'name',
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
