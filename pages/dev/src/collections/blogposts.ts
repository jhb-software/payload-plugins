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
      // Demonstrates the overrides for the generated fields: the picker only
      // offers published pages, ANDed with the plugin's exclude-self filter.
      filterOptions: { _status: { equals: 'published' } },
      admin: { description: 'Blog posts can only be attached to a published page.' },
    },
    breadcrumbs: {
      labelField: 'shortTitle',
    },
    slug: {
      admin: { position: 'main' },
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
