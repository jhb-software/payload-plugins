import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'
import { captureAfterChangeDoc } from '../test/afterChangeCapture'
import {
  recordPathChangesAfterChange,
  recordPathChangesAfterDelete,
} from '../test/pathChangesCapture'

export const Pages: PageCollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    afterChange: [captureAfterChangeDoc, recordPathChangesAfterChange],
    afterDelete: [recordPathChangesAfterDelete],
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
    },
    isRootCollection: true,
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup. A compound
      // ['slug', 'tenant'] index is not an option here: the SQL adapters reject a compound index
      // mixing the localized `slug` with the unlocalized `tenant`.
      unique: false,
    },
  },
  trash: true,
  versions: {
    drafts: {
      // Each locale publishes on its own, so `/en/...` can be live while `/de/...` is still a draft.
      localizeStatus: true,
    },
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
