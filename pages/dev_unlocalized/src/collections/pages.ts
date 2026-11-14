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
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
}
