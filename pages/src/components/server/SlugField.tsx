import type { TextFieldServerProps } from 'payload'

import type { SlugFieldProps } from '../client/SlugFieldClient.js'

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

  let redirectsCollectionSlug = payload.config.collections?.find(
    (col) => col.custom?.isRedirectsCollection === true,
  )?.slug

  if (!redirectsCollectionSlug) {
    console.warn(
      '[Pages Plugin] No redirects collection found. Falling back to "redirects" collection.',
    )
  }

  redirectsCollectionSlug = redirectsCollectionSlug || 'redirects'

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
