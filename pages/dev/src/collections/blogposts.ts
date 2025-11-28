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
          collection: 'pages',
          name: 'parent',
          sharedDocument: true,
        },
        breadcrumbs: {
          labelField: 'shortTitle',
        },
      },
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
      name: 'shortTitle',
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
    {
      name: 'author',
      type: 'relationship',
      required: true,
      relationTo: 'authors',
      hasMany: false,
    },
  ],
}
