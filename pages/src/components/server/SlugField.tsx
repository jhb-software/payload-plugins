import type { TextFieldServerProps } from 'payload'

import type { SlugFieldProps } from '../client/SlugFieldClient.js'

import { isRedirectsCollectionConfig } from '../../utils/pageCollectionConfigHelpers.js'
import SlugFieldClient from '../client/SlugFieldClient.js'

/**
 * Server component which wraps the `SlugFieldClient` component and handles access-aware readOnly state.
 */
export const SlugField = ({
  clientField,
  defaultValue,
  fallbackField,
  pageSlug,
  path,
  payload,
  permissions,
  readOnly,
}: SlugFieldProps & TextFieldServerProps) => {
  const isReadOnly = readOnly || (permissions !== true && permissions?.update !== true)

  const redirectsCollection = payload.config.collections?.find((col) =>
    isRedirectsCollectionConfig(col),
  )

  if (!redirectsCollection) {
    console.warn(
      '[Pages Plugin] No redirects collection found. Falling back to "redirects" collection.',
    )
  }

  const redirectsCollectionSlug = redirectsCollection?.slug ?? 'redirects'

  return (
    <SlugFieldClient
      defaultValue={defaultValue}
      fallbackField={fallbackField}
      field={clientField}
      pageSlug={pageSlug}
      path={path}
      readOnly={isReadOnly}
      redirectsCollectionSlug={redirectsCollectionSlug}
    />
  )
}
