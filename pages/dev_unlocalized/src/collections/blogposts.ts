import { createPageCollectionConfig } from '@jhb.software/payload-pages-plugin'
import { CollectionConfig } from 'payload'

export const Blogposts: CollectionConfig = createPageCollectionConfig({
  slug: 'blogposts',
  admin: {
    useAsTitle: 'title',
  },
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
})
