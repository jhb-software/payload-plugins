import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'
import { captureAfterChangeDoc } from '../test/afterChangeCapture'
import {
  recordPathChangesAfterChange,
  recordPathChangesAfterDelete,
} from '../test/pathChangesCapture'

/**
 * A collection which nests both under `pages` and under itself, so a topic can hang off a page
 * (`/shop/mens`) and off another topic (`/shop/mens/shirts`).
 */
export const Topics: PageCollectionConfig = {
  slug: 'topics',
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    afterChange: [captureAfterChangeDoc, recordPathChangesAfterChange],
    afterDelete: [recordPathChangesAfterDelete],
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
      localized: true,
    },
  ],
}
