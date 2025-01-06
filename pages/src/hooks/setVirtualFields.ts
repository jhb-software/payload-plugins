import { CollectionBeforeReadHook } from 'payload'
import { asPageCollectionConfigOrThrow } from '../collections/PageCollectionConfig.js'
import { Locale } from '../types/Locale.js'
import { IncomingPageCollectionConfig } from '../types/PageCollectionConfig.js'
import { setPageDocumentVirtualFields } from '../utils/setPageVirtualFields.js'
import { setRootPageDocumentVirtualFields } from '../utils/setRootPageVirtualFields.js'

/**
 * Returns the fields that are necessary for the setVirtualFields hook to correctly generate the virtual fields.
 */
export function requiredFields(collectionConfig: IncomingPageCollectionConfig): string[] {
  return [
    'isRootPage',
    'slug',
    collectionConfig.page.parentField,
    collectionConfig.page.breadcrumbLabelField ?? collectionConfig.admin?.useAsTitle ?? 'id',
  ]
}

/**
 * A [CollectionBeforeReadHook] that sets the values for all virtual fields (path, breadcrumbs, alternatePaths) before a document is read.
 *
 * A "before read" hook is used, because it is fired before localized fields are flattened which is necessary for generating the alternate paths.
 */
export const setVirtualFieldsBeforeRead: CollectionBeforeReadHook = async ({
  doc,
  req,
  collection,
  context,
}) => {
  const locale = req.locale as Locale | 'all'
  const pageConfig = asPageCollectionConfigOrThrow(collection)

  // #### Validate selected fields (if any) and return if no virtual fields are selected
  if (context.select) {
    const selectedFields = Object.keys(context.select)

    // If none of the virtual paths generated by this hook are selected, return early
    if (
      !selectedFields.includes('path') &&
      !selectedFields.includes('breadcrumbs') &&
      !selectedFields.includes('alternatePaths')
    ) {
      return doc
    }

    const missingFields = requiredFields(pageConfig).filter(
      (field) => !selectedFields.includes(field),
    )

    if (missingFields.length > 0) {
      throw new Error(
        'The following fields are needed to generate the virtual fields but were not selected: ' +
          missingFields.join(', ') +
          '. Collection: ' +
          collection.slug +
          '. Document: ' +
          doc.id,
      )
    }
  }

  const locales = (req?.payload.config.localization! as any).localeCodes as Locale[]

  if (doc.isRootPage) {
    const docWithVirtualFields = setRootPageDocumentVirtualFields({
      doc,
      locale,
      locales,
      breadcrumbLabelField: pageConfig.page.breadcrumbLabelField,
    })

    return docWithVirtualFields
  } else {
    // When the slug is not (yet) set, it is not possible to generate the path and breadcrumbs
    if ((locale !== 'all' && !doc.slug?.[locale]) || (locale === 'all' && !doc.slug)) {
      return doc
    }

    if (typeof doc.slug !== 'object') {
      throw new Error(
        'The slug must be an object with all available locales. Is the slug field set to be localized?',
      )
    }

    const docWithVirtualFields = await setPageDocumentVirtualFields({
      req,
      doc,
      locale,
      locales,
      pageConfigAttributes: pageConfig.page,
    })

    return docWithVirtualFields
  }
}
