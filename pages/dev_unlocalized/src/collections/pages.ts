import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Pages: PageCollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
    },
    isRootCollection: true,
  },
  versions: {
    drafts: true,
  },
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
