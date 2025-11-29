import type { CollectionConfig } from 'payload'

export const Blogposts: CollectionConfig = {
  slug: 'blogposts',
  admin: {
    useAsTitle: 'title',
  },
  custom: {
    pagesPlugin: {
      page: {
        parent: {
          collection: 'authors',
          name: 'author',
          sharedDocument: false,
        },
        breadcrumbs: {
          labelField: 'shortTitle',
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
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'shortTitle',
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
