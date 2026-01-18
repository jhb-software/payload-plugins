import type { Field, PayloadRequest, Where } from 'payload'

import type { IncomingPageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { getPageCollectionConfigAttributes } from '../utils/getPageCollectionConfigAttributes.js'
import { translatedLabel } from '../utils/translatedLabel.js'

export function parentField(
  pageConfig: IncomingPageCollectionConfigAttributes,
  collectionSlug: string,
  baseFilter?: PagesPluginConfig['baseFilter'],
): Field {
  return {
    name: pageConfig.parent.name,
    type: 'relationship',
    filterOptions: ({ data }) => {
      if (!data.id) {
        // Before the document is created, there is no id, therefore do not filter
        return true
      }

      // Exclude the current document from the list of available parents.
      // NOTE: To not hide documents with the same serial id in another collection, only apply the filter if the parent collection is the same as the current collection.
      if (pageConfig.parent.collection === collectionSlug) {
        return {
          id: {
            not_equals: data.id,
          },
        }
      }

      return true
    },
    label: translatedLabel('parent'),
    relationTo: pageConfig.parent.collection,
    required: !pageConfig.isRootCollection,

    admin: {
      components: {
        Field: '@jhb.software/payload-pages-plugin/server#ParentField',
      },
      position: 'sidebar',
      // hide this field on the root page
      condition: pageConfig.isRootCollection ? (data) => !data?.isRootPage : undefined,
    },
    // When this collection has a shared parent document, set the parent field:
    defaultValue: async ({ req }: { req: PayloadRequest }) => {
      const {
        parent: { name: parentField, sharedDocument: sharedParentDocument },
      } = getPageCollectionConfigAttributes({
        collectionSlug,
        payload: req.payload,
      })

      if (sharedParentDocument) {
        // If the current document
        // 1. is the first document in the collection, this will return null, so the user can choose a parent for the first document
        // 2. is another new document, then this will return the shared parent value
        const baseFilterWhere: undefined | Where =
          typeof baseFilter === 'function' ? baseFilter({ req }) : undefined

        const response = await req.payload.find({
          collection: collectionSlug,
          depth: 0, // only get the id of the parent document
          draft: true,
          limit: 1,
          select: {
            [parentField]: true,
          },
          where: {
            and: [
              { [parentField]: { not_equals: null } },
              ...(baseFilterWhere ? [baseFilterWhere] : []),
            ],
          },
        })
        const fetchedParentValue = (response.docs.at(0) as any)?.[parentField] ?? null

        if (fetchedParentValue) {
          return fetchedParentValue
        }
      }

      return undefined
    },
  }
}
