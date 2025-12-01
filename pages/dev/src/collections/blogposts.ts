import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Blogposts: PageCollectionConfig = {
  slug: 'blogposts',
  admin: {
    useAsTitle: 'title',
  },
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
