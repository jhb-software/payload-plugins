import type { TextFieldServerProps } from 'payload'

import { resolveLocalePrefixes } from '../../utils/resolveLocaleRouting.js'
import { PathField as PathFieldClient } from '../client/PathField.js'

/**
 * Server component which wraps `PathField` and hands it the locale prefixes of the request.
 *
 * The client has no `req`, so the routing — which may be a per-request function — cannot be
 * resolved there. It is resolved here and passed as plain data.
 */
export const PathField = async ({
  clientField,
  collectionSlug,
  path,
  payload,
  req,
}: TextFieldServerProps) => (
  <PathFieldClient
    field={clientField}
    localePrefixes={await resolveLocalePrefixes({ collectionSlug, payload, req })}
    path={path}
  />
)
