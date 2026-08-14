import type {
  DefaultDocumentIDType,
  PayloadRequest,
  SanitizedCollectionConfig,
  SelectType,
} from 'payload'

import { hasDraftsEnabled, isLiveRow } from '../queries/liveness.js'
import { MissingAncestorError } from './loadAncestors.js'
import { asPageCollectionConfigOrThrow } from './pageCollectionConfigHelpers.js'
import { setPageDocumentVirtualFields } from './setPageVirtualFields.js'
import { ROOT_PAGE_SLUG } from './setRootPageVirtualFields.js'

/** The current paths of one document, computed from the main table row. */
export type DocPaths = {
  /** Whether the document's path resolves: published (with drafts enabled) and not trashed. */
  live: boolean
  /**
   * The path per locale (keyed `''` on an unlocalized install). Empty when no path is
   * computable — the slug is unset, or the ancestor chain is broken.
   */
  paths: Record<string, string>
}

/** A `DocPaths` value for a document which does not resolve and has no computable path. */
export const noDocPaths = (): DocPaths => ({ live: false, paths: {} })

/**
 * Reads a document's main table row and computes its paths for every locale.
 *
 * The read goes through `payload.db`, so it sees the row as it is right now — inside a
 * transaction that includes the writes of the surrounding operation — without firing any hooks.
 * Returns null when the row does not exist.
 */
export async function computeDocPaths({
  id,
  collectionConfig,
  req,
}: {
  collectionConfig: SanitizedCollectionConfig
  id: DefaultDocumentIDType
  req: PayloadRequest
}): Promise<DocPaths | null> {
  const pageConfig = asPageCollectionConfigOrThrow(collectionConfig)
  const pageAttributes = pageConfig.page

  const localization = req.payload.config.localization
  const locales = localization ? localization.localeCodes : undefined

  const select: SelectType = {
    slug: true,
    [pageAttributes.parent.name]: true,
    ...(pageAttributes.isRootCollection ? { isRootPage: true } : {}),
    ...(hasDraftsEnabled(collectionConfig) ? { _status: true } : {}),
    ...(collectionConfig.trash ? { deletedAt: true } : {}),
  }

  const { docs } = await req.payload.db.find({
    collection: collectionConfig.slug,
    limit: 1,
    locale: locales ? 'all' : undefined,
    pagination: false,
    req,
    select,
    where: { id: { equals: id } },
  })

  const row = docs[0] as Record<string, any> | undefined
  if (!row) {
    return null
  }

  const live = isLiveRow(row, collectionConfig)

  if (row.isRootPage === true) {
    return { live, paths: rootPagePaths(row, locales) }
  }

  if (!row.slug) {
    return { live, paths: {} }
  }

  try {
    const withVirtualFields = await setPageDocumentVirtualFields({
      doc: row,
      locale: locales ? 'all' : undefined,
      locales,
      pageConfigAttributes: pageAttributes,
      req,
    })

    const path = withVirtualFields.path
    return { live, paths: typeof path === 'string' ? { '': path } : { ...path } }
  } catch (error) {
    if (error instanceof MissingAncestorError) {
      // A broken ancestor chain means the path cannot be computed, so it does not resolve —
      // the same way findPageByPath fails to match such a document.
      return { live, paths: {} }
    }
    throw error
  }
}

/** The root page's paths: the locale prefix per locale carrying the root slug, or `/`. */
function rootPagePaths(
  row: Record<string, any>,
  locales: string[] | undefined,
): Record<string, string> {
  if (!locales) {
    return { '': '/' }
  }

  const paths: Record<string, string> = {}
  for (const locale of locales) {
    const slug = typeof row.slug === 'object' && row.slug !== null ? row.slug[locale] : row.slug
    if (slug === ROOT_PAGE_SLUG) {
      paths[locale] = `/${locale}`
    }
  }
  return paths
}
