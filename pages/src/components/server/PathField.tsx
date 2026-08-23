import type { TextFieldServerProps } from 'payload'

import type { PagesPluginConfig } from '../../types/PagesPluginConfig.js'

import { localePrefixMap } from '../../utils/localePrefix.js'
import { resolveLocaleRouting } from '../../utils/resolveLocaleRouting.js'
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
}: TextFieldServerProps) => {
  const collection = payload.config.collections.find(
    (candidate) => candidate.slug === collectionSlug,
  )
  const routing = await resolveLocaleRouting({
    payload,
    pluginConfig: collection?.custom?.pagesPluginConfig as PagesPluginConfig | undefined,
    req,
  })
  const localization = payload.config.localization

  return (
    <PathFieldClient
      field={clientField}
      localePrefixes={localePrefixMap(localization ? localization.localeCodes : undefined, routing)}
      path={path}
    />
  )
}
