import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'
import { captureAfterChangeDoc } from '../test/afterChangeCapture'

export const Pages: PageCollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    afterChange: [captureAfterChangeDoc],
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
    },
    isRootCollection: true,
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup (see indexes below)
      unique: false,
    },
  },
  trash: true,
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
