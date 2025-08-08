import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Authors: PageCollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
      sharedDocument: true,
    },
    breadcrumbs: {
      labelField: 'name',
    },
  },
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
