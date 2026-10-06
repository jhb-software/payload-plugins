import type { PayloadRequest, TextFieldServerProps } from 'payload'

import { pickFieldValue } from '../../utils/getBreadcrumbs.js'
import { loadAncestorChain } from '../../utils/loadAncestors.js'
import { pageAttributesOf } from '../../utils/pageCollectionConfigHelpers.js'
import { tryResolveParentRef } from '../../utils/parentRef.js'
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
  data,
  path,
  payload,
  req,
}: TextFieldServerProps) => (
  <PathFieldClient
    ancestorWithoutSlug={await findAncestorWithoutSlug({ collectionSlug, data, req })}
    field={clientField}
    localePrefixes={await resolveLocalePrefixes({ collectionSlug, payload, req })}
    path={path}
  />
)

/**
 * The label of the first ancestor without a slug in the edited locale, which leaves the document
 * without a path there. Read once on load, so a parent changed in the form shows up after saving.
 */
async function findAncestorWithoutSlug({
  collectionSlug,
  data,
  req,
}: {
  collectionSlug: string
  data: Record<string, unknown> | undefined
  req: PayloadRequest
}): Promise<string | undefined> {
  const pageConfig = pageAttributesOf(req.payload.collections[collectionSlug]?.config)
  const locale = req.locale
  if (!pageConfig || !data || !locale || locale === 'all' || !req.payload.config.localization) {
    return undefined
  }

  const parentRef = tryResolveParentRef(data[pageConfig.parent.name], pageConfig)
  if (!parentRef) {
    return undefined
  }

  try {
    const ancestors = await loadAncestorChain({
      id: parentRef.id,
      collection: parentRef.collection,
      docId: data.id,
      draft: true,
      locale,
      req,
    })
    const ancestor = ancestors.find(
      ({ slug, isRootPage }) => !isRootPage && !pickFieldValue(slug, locale),
    )

    if (!ancestor) {
      return undefined
    }

    // The ancestor likely lacks a label in this locale too, so any locale's label names it.
    const labels =
      ancestor.label && typeof ancestor.label === 'object' ? Object.values(ancestor.label) : []
    return (
      pickFieldValue(ancestor.label, locale) ??
      labels.find((label): label is string => typeof label === 'string') ??
      String(ancestor.id)
    )
  } catch {
    // A broken chain (deleted or circular parent) is reported by the path computation itself.
    return undefined
  }
}
