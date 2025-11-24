import { TextFieldServerProps } from 'payload'
import SlugFieldClient, { SlugFieldProps } from '../client/SlugFieldClient.js'

/**
 * Server component which wraps the `SlugFieldClient` component and handles access-aware readOnly state.
 */
export const SlugField = async ({
  clientField,
  path,
  permissions,
  readOnly,
  fallbackField,
  defaultValue,
  pageSlug,
  payload,
}: TextFieldServerProps & SlugFieldProps) => {
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
      field={clientField}
      path={path as string}
      readOnly={isReadOnly}
      fallbackField={fallbackField}
      defaultValue={defaultValue}
      pageSlug={pageSlug}
      redirectsCollectionSlug={redirectsCollectionSlug}
    />
  )
}
