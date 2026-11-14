import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

/**
 * A collection whose documents all live under the same parent, which may be either a page or a
 * topic. Combining `sharedDocument` with a polymorphic parent means the shared default carries
 * the collection along with the id (`{ relationTo, value }`).
 */
export const Announcements: PageCollectionConfig = {
  slug: 'announcements',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: ['pages', 'topics'],
      name: 'parent',
      sharedDocument: true,
    },
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
  ],
}
