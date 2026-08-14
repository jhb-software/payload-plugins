import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

/**
 * A collection which nests both under `pages` and under itself, exercising the unlocalized
 * branch of the breadcrumb assembly across a chain that crosses collections.
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
    // Siblings under different parents may share a slug, which a self-nesting collection hits
    // immediately: /shop/mens/shirts alongside /shop/womens/shirts.
    slug: {
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
