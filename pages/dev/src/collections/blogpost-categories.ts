import { slugField } from '@jhb.software/payload-pages-plugin'
import { CollectionConfig } from 'payload'

// This collection is designed to test the functionality of the slugField in a non-page context.
export const BlogpostCategories: CollectionConfig = {
  slug: 'blogpost-categories',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    slugField({ fallbackField: 'title' }),
  ],
}
