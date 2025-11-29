import type { TextFieldServerComponent } from 'payload'

import { getPageCollectionConfigAttributes } from '../../utils/getPageCollectionConfigAttributes.js'
import { PathFieldClient } from '../client/PathFieldClient.js'

/**
 * Server component which wraps the `PathFieldClient` component and passes
 * the required page config attributes as props.
 */
export const PathField: TextFieldServerComponent = ({
  clientField,
  collectionSlug,
  path,
  payload,
}) => {
  const { breadcrumbs, parent } = getPageCollectionConfigAttributes({
    collectionSlug,
    payload,
  })

  return (
    <PathFieldClient
      breadcrumbLabelField={breadcrumbs.labelField}
      field={clientField}
      parentCollection={parent.collection}
      parentFieldName={parent.name}
      path={path}
    />
  )
}
