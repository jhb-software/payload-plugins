import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

/**
 * A collection which nests both under `pages` and under itself, exercising `baseFilter` against
 * a polymorphic parent.
 */
export const Topics: PageCollectionConfig = {
  slug: 'topics',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: ['pages', 'topics'],
      name: 'parent',
    },
    slug: {
      // Disabled for the multi-tenant setup, and because siblings under different parents may
      // share a slug.
      unique: false,
    },
  },
  trash: true,
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
}
