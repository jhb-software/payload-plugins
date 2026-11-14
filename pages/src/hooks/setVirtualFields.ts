import type { CollectionAfterChangeHook, CollectionBeforeReadHook } from 'payload'

import { hasDraftsEnabled } from 'payload/shared'

import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'

import { localeFromRequest, localesFromRequest } from '../utils/localeFromRequest.js'
import { operationDraft, virtualFieldsWanted } from '../utils/operationContext.js'
import {
  asPageCollectionConfigOrThrow,
  pagesPluginConfigOf,
} from '../utils/pageCollectionConfigHelpers.js'
import { parentRefKey, tryResolveParentRef } from '../utils/parentRef.js'
import { resolveLocaleRouting } from '../utils/resolveLocaleRouting.js'
import { setPageDocumentVirtualFields } from '../utils/setPageVirtualFields.js'
import { setRootPageDocumentVirtualFields } from '../utils/setRootPageVirtualFields.js'

/**
 * Returns the fields that the setVirtualFields hook depends on to correctly generate the virtual fields.
 */
export function dependentFields(collectionConfig: PageCollectionConfig): string[] {
  return [
    'isRootPage',
    'slug',
    collectionConfig.page.parent.name,
    collectionConfig.page.breadcrumbs.labelField,
    ...(hasDraftsEnabled(collectionConfig) ? ['_status'] : []),
  ]
}

/**
 * A [CollectionBeforeReadHook] that sets the values for all virtual fields (path, breadcrumbs, alternatePaths) before a document is read.
 *
 * A "before read" hook is used, because it is fired before localized fields are flattened which is necessary for generating the alternate paths.
 */
export const setVirtualFieldsBeforeRead: CollectionBeforeReadHook = async ({
  collection,
  context,
  doc,
  req,
}) => {
  // If the selectDependentFieldsBeforeOperation hook detected that no virtual fields are
  // selected for this collection, return early.
  if (!virtualFieldsWanted(context, collection.slug)) {
    return doc
  }

  const pageConfig = asPageCollectionConfigOrThrow(collection)

  const locale = localeFromRequest(req)
  const locales = localesFromRequest(req)
  const routing = await resolveLocaleRouting({
    payload: req.payload,
    pluginConfig: pagesPluginConfigOf(collection),
    req,
  })

  if (doc.isRootPage) {
    // Root pages don't need async lookups, so no try-catch needed
    return withoutFallbackPaths(
      setRootPageDocumentVirtualFields({
        breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
        collection,
        doc,
        draft: operationDraft(context),
        locale: locales ? 'all' : undefined, // For localized pages, the CollectionBeforeReadHook should always return the field values for all locales
        locales,
        routing,
      }),
      locale,
    )
  }

  // Without a slug in any locale there is nothing to build a path from. A slug missing in the
  // requested locale alone is no reason to stop: the locales which do have one still get their
  // `alternatePaths`.
  if (!doc.slug) {
    return doc
  }

  if (locales && typeof doc.slug !== 'object') {
    throw new Error(
      'The slug must be an object with all available locales. Is the slug field set to be localized?',
    )
  }

  try {
    return withoutFallbackPaths(
      await setPageDocumentVirtualFields({
        collection,
        doc,
        draft: operationDraft(context),
        locale: locales ? 'all' : undefined, // For localized pages, the CollectionBeforeReadHook should always return the field values for all locales
        locales,
        pageConfigAttributes: pageConfig.page,
        req,
        routing,
      }),
      locale,
    )
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `Failed to compute virtual fields for doc (id: ${doc.id})`,
    )
    return doc
  }
}

/**
 * On a single-locale read of a locale without a path, replaces the `path` and `breadcrumbs` locale
 * maps with `{}` so Payload's locale fallback cannot fill in another locale's URL and trail. A `null`
 * entry would not stop it: Payload falls back on `null` too.
 */
function withoutFallbackPaths(
  doc: Record<string, unknown>,
  locale: ReturnType<typeof localeFromRequest>,
): Record<string, unknown> {
  const paths = doc.path as Record<Locale, string | undefined> | string | undefined

  if (!locale || locale === 'all' || !paths || typeof paths !== 'object' || paths[locale]) {
    return doc
  }

  return {
    ...doc,
    ...('breadcrumbs' in doc && { breadcrumbs: {} }),
    path: {},
  }
}

/**
 * A `CollectionAfterChangeHook` that sets the values for all virtual fields.
 *
 * This hook is NOT redundant with `setVirtualFieldsBeforeRead` — Payload does not call
 * `beforeRead` hooks during create/update operations (only `afterRead` hooks fire).
 * Therefore this `afterChange` hook is the only way to compute virtual fields on `doc`
 * and `previousDoc` after a document is created or updated.
 */
export const setVirtualFieldsAfterChange: CollectionAfterChangeHook = async ({
  collection,
  doc,
  previousDoc,
  req,
}) => {
  // This type of hook is only called for one locale (therefore the locale cannot be set to 'all')
  const locale = localeFromRequest(req)
  const locales = localesFromRequest(req)

  const pageConfig = asPageCollectionConfigOrThrow(collection)
  const parentField = pageConfig.page.parent.name
  const draft = operationDraft(req.context)
  const routing = await resolveLocaleRouting({
    payload: req.payload,
    pluginConfig: pagesPluginConfigOf(collection),
    req,
  })

  let docWithVirtualFields: Record<string, unknown>

  if (doc.isRootPage) {
    docWithVirtualFields = setRootPageDocumentVirtualFields({
      breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
      collection,
      doc,
      draft,
      locale,
      locales,
      routing,
    })
  } else if (!doc.slug) {
    // When the slug is not (yet) set, it is not possible to generate the path and breadcrumbs
    docWithVirtualFields = doc
  } else {
    try {
      docWithVirtualFields = await setPageDocumentVirtualFields({
        collection,
        doc,
        draft,
        locale,
        locales,
        pageConfigAttributes: pageConfig.page,
        req,
        routing,
      })
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        `Failed to compute virtual fields for doc (id: ${doc.id})`,
      )
      // Note: docWithVirtualFields falls back to the raw doc, so virtual fields
      // (path, breadcrumbs, meta) will be undefined. If dependentFieldsUnchanged
      // is true below, previousDoc will also receive these undefined values —
      // keeping both doc and previousDoc consistently without virtual fields.
      docWithVirtualFields = doc
    }
  }

  // Set virtual fields on previousDoc (mutated in place) so that subsequent
  // afterChange hooks can access the previous path (e.g. for ISR revalidation).
  // Wrapped in try-catch because previousDoc's parent may no longer exist.
  try {
    // The parent comparison must be collection-qualified: with a polymorphic parent the same id
    // can point at different collections, so bare ids are not enough to detect a re-parent.
    const docParentRef = tryResolveParentRef(doc[parentField], pageConfig.page)
    const previousParentRef = tryResolveParentRef(previousDoc[parentField], pageConfig.page)
    const parentUnchanged =
      docParentRef === null || previousParentRef === null
        ? docParentRef === previousParentRef
        : parentRefKey(docParentRef) === parentRefKey(previousParentRef)

    // `_status` counts as well: an unpublish removes the written locale's path from `doc`, while
    // `previousDoc` still has it for hooks revalidating the URL which just stopped resolving.
    const dependentFieldsUnchanged =
      parentUnchanged &&
      doc.slug === previousDoc.slug &&
      doc.isRootPage === previousDoc.isRootPage &&
      doc._status === previousDoc._status

    if (dependentFieldsUnchanged) {
      const meta = docWithVirtualFields.meta as { alternatePaths?: unknown } | undefined
      // Reuse the already-computed virtual fields to avoid redundant DB queries
      Object.assign(previousDoc, {
        breadcrumbs: docWithVirtualFields.breadcrumbs,
        path: docWithVirtualFields.path,
        ...(meta?.alternatePaths
          ? {
              meta: {
                ...previousDoc.meta,
                alternatePaths: meta.alternatePaths,
              },
            }
          : {}),
      })
    } else if (previousDoc.isRootPage) {
      const result = setRootPageDocumentVirtualFields({
        breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
        collection,
        doc: previousDoc,
        draft,
        locale,
        locales,
        routing,
      })
      Object.assign(previousDoc, result)
    } else if (previousDoc.slug) {
      const result = await setPageDocumentVirtualFields({
        collection,
        doc: previousDoc,
        draft,
        locale,
        locales,
        pageConfigAttributes: pageConfig.page,
        req,
        routing,
      })
      Object.assign(previousDoc, result)
    }
  } catch (error) {
    // If previousDoc's virtual fields cannot be computed (e.g. its parent was deleted),
    // log the error but don't break the afterChange hook — doc's virtual fields are still returned correctly.
    req.payload.logger.error(
      { err: error },
      `Failed to compute virtual fields for previousDoc (id: ${previousDoc.id})`,
    )
  }

  return docWithVirtualFields
}
