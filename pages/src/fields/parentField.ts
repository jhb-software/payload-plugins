import type { Field, PayloadRequest, RelationshipField, Where } from 'payload'

import type {
  IncomingPageCollectionConfigAttributes,
  PageCollectionConfigAttributes,
} from '../types/PageCollectionConfigAttributes.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { composeFilterOptions, mergeFieldAdmin } from '../utils/fieldOverrides.js'
import { getPageCollectionConfigAttributes } from '../utils/getPageCollectionConfigAttributes.js'
import { hasPolymorphicParent, parentCollections } from '../utils/parentRef.js'
import { translatedLabel } from '../utils/translatedLabel.js'

export function parentField(
  pageConfig: IncomingPageCollectionConfigAttributes,
  collectionSlug: string,
  baseFilter?: PagesPluginConfig['baseFilter'],
  overrides?: Pick<IncomingPageCollectionConfigAttributes['parent'], 'admin' | 'filterOptions'>,
): Field {
  const relationTo = pageConfig.parent.collection

  const field = {
    name: pageConfig.parent.name,
    type: 'relationship',
    filterOptions: composeFilterOptions(({ data, relationTo }) => {
      if (!data.id) {
        // Before the document is created, there is no id, therefore do not filter
        return true
      }

      // Exclude the current document from the list of available parents.
      // NOTE: `filterOptions` runs once per relation, so `relationTo` is the relation being
      // filtered, not the whole config. Restricting the filter to this collection avoids
      // hiding documents which happen to share the serial id in another collection.
      if (relationTo === collectionSlug) {
        return {
          id: {
            not_equals: data.id,
          },
        }
      }

      return true
    }, overrides?.filterOptions),
    // The SQL adapters index relationship columns automatically, but MongoDB only indexes
    // fields with an explicit index. Child-page lookups and parent-deletion checks filter
    // by this field, so it must be indexed.
    index: true,
    label: translatedLabel('parent'),
    relationTo,
    required: !pageConfig.isRootCollection,

    admin: mergeFieldAdmin<NonNullable<RelationshipField['admin']>>(
      {
        components: {
          Field: '@jhb.software/payload-pages-plugin/server#ParentField',
        },
        position: 'sidebar',
        // hide this field on the root page
        condition: pageConfig.isRootCollection
          ? (data: Partial<{ isRootPage?: boolean }>) => !data?.isRootPage
          : undefined,
      },
      overrides?.admin,
    ),
    // When this collection has a shared parent document, set the parent field:
    defaultValue: async ({ req }: { req: PayloadRequest }) => {
      const pageConfigAttributes = getPageCollectionConfigAttributes({
        collectionSlug,
        payload: req.payload,
      })
      const {
        parent: { name: parentField, sharedDocument: sharedParentDocument },
      } = pageConfigAttributes

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
              parentIsSetWhere(pageConfigAttributes),
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

  // `RelationshipField` is a union of its monomorphic and polymorphic members, which differ in
  // the type of `admin.sortOptions`. `relationTo` is only known to be one or the other at
  // runtime, so the assembled object matches neither member statically.
  return field as Field
}

/**
 * Matches the documents whose parent field is set.
 *
 * A polymorphic parent is stored as `{ relationTo, value }`, which the SQL adapters keep in a
 * join row: a query against the field itself, or against `parent.value`, is rejected there.
 * Asking for each configured relation in turn is understood by every adapter.
 */
function parentIsSetWhere(attributes: PageCollectionConfigAttributes): Where {
  const parentFieldName = attributes.parent.name

  if (!hasPolymorphicParent(attributes)) {
    return { [parentFieldName]: { not_equals: null } }
  }

  return {
    or: parentCollections(attributes).map((slug) => ({
      [`${parentFieldName}.relationTo`]: { equals: slug },
    })),
  }
}
