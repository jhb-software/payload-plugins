import type { CollectionAfterChangeHook, CollectionBeforeReadHook } from 'payload'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'

import { localeFromRequest, localesFromRequest } from '../utils/localeFromRequest.js'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
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
  // If the selectDependentFieldsBeforeOperation hook detected that no virtual fields are selected, return early.
  if (context.generateVirtualFields !== true) {
    return doc
  }

  const pageConfig = asPageCollectionConfigOrThrow(collection)

  const locale = localeFromRequest(req)
  const locales = localesFromRequest(req)

  if (doc.isRootPage) {
    const docWithVirtualFields = setRootPageDocumentVirtualFields({
      breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
      doc,
      locale: locales ? 'all' : undefined, // For localized pages, the CollectionBeforeReadHook should always return the field values for all locales
      locales,
    })

    return docWithVirtualFields
  } else {
    // When the slug is not (yet) set, it is not possible to generate the virtual fields
    if ((locale && locale !== 'all' && !doc.slug?.[locale]) || !doc.slug) {
      return doc
    }

    if (locales && typeof doc.slug !== 'object') {
      throw new Error(
        'The slug must be an object with all available locales. Is the slug field set to be localized?',
      )
    }

    const docWithVirtualFields = await setPageDocumentVirtualFields({
      doc,
      locale: locales ? 'all' : undefined, // For localized pages, the CollectionBeforeReadHook should always return the field values for all locales
      locales,
      pageConfigAttributes: pageConfig.page,
      req,
    })

    return docWithVirtualFields
  }
}

/**
 * A `CollectionAfterChangeHook` that sets the values for all virtual fields.
 *
 * This "after change" hook is needed to re-fill the virtual fields after a document is changed/saved in the admin panel.
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

  let docWithVirtualFields: Record<string, unknown>

  if (doc.isRootPage) {
    docWithVirtualFields = setRootPageDocumentVirtualFields({
      breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
      doc,
      locale,
      locales,
    })
  } else if (!doc.slug) {
    // When the slug is not (yet) set, it is not possible to generate the path and breadcrumbs
    docWithVirtualFields = doc
  } else {
    docWithVirtualFields = await setPageDocumentVirtualFields({
      doc,
      locale,
      locales,
      pageConfigAttributes: pageConfig.page,
      req,
    })
  }

  // Set virtual fields on previousDoc (mutated in place) so that subsequent
  // afterChange hooks can access the previous path.
  const dependentFieldsUnchanged =
    extractID(doc[parentField]) === extractID(previousDoc[parentField]) &&
    doc.slug === previousDoc.slug &&
    doc.isRootPage === previousDoc.isRootPage

  if (dependentFieldsUnchanged) {
    // Reuse the already-computed virtual fields to avoid redundant DB queries
    Object.assign(previousDoc, {
      breadcrumbs: docWithVirtualFields.breadcrumbs,
      path: docWithVirtualFields.path,
      ...(docWithVirtualFields.meta ? { meta: docWithVirtualFields.meta } : {}),
    })
  } else if (previousDoc.isRootPage) {
    const result = setRootPageDocumentVirtualFields({
      breadcrumbLabelField: pageConfig.page.breadcrumbs.labelField,
      doc: previousDoc,
      locale,
      locales,
    })
    Object.assign(previousDoc, result)
  } else if (previousDoc.slug) {
    const result = await setPageDocumentVirtualFields({
      doc: previousDoc,
      locale,
      locales,
      pageConfigAttributes: pageConfig.page,
      req,
    })
    Object.assign(previousDoc, result)
  }

  return docWithVirtualFields
}

/** Extracts a plain ID from a value that may be a raw ID or a populated document object. */
function extractID(value: unknown): string | number | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && 'id' in value) return (value as { id: string | number }).id
  return undefined
}
