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

  const redirectsCollection =
    payload.config.collections?.find((col) => col.custom?.redirects === true)?.slug || 'redirects'

  return (
    <SlugFieldClient
      field={clientField}
      path={path as string}
      readOnly={isReadOnly}
      fallbackField={fallbackField}
      defaultValue={defaultValue}
      pageSlug={pageSlug}
      redirectsCollection={redirectsCollection}
    />
  )
}
