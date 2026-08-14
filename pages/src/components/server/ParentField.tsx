import type { RelationshipFieldServerComponent } from 'payload'

import { RelationshipField } from '@payloadcms/ui'

import { getPageCollectionConfigAttributes } from '../../utils/getPageCollectionConfigAttributes.js'

/**
 * Parent field which sets the field to be read only if the collection has a shared parent document and the field has a value.
 */
export const ParentField: RelationshipFieldServerComponent = ({
  clientField,
  collectionSlug,
  data,
  path,
  payload,
  permissions,
  readOnly,
}) => {
  const {
    parent: { name: parentField, sharedDocument: sharedParentDocument },
  } = getPageCollectionConfigAttributes({
    collectionSlug,
    payload,
  })

  // A polymorphic parent stores `{ relationTo, value }` rather than a bare id, so this is only
  // read for its truthiness.
  const parentValue: unknown = data?.[parentField] ?? undefined
  // Check both shared parent document and permissions
  const isReadOnly =
    Boolean(sharedParentDocument && parentValue) ||
    readOnly ||
    (permissions !== true && permissions?.update !== true)

  return <RelationshipField field={clientField} path={path} readOnly={isReadOnly} />
}
