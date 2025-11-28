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
      },
    },
  },
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
