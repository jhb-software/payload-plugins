import { CollectionBeforeOperationHook } from 'payload'
import { asPageCollectionConfigOrThrow } from '../collections/PageCollectionConfig.js'
import { requiredFields } from './setVirtualFields.js'

/**
 * A CollectionBeforeOperationHook that ensures that all required fields for the
 * setVirtualFields hook to generate the path and breadcrumbs fields are selected.
 */
export const ensureSelectedFieldsBeforeOperation: CollectionBeforeOperationHook = async ({
  args,
  operation,
  context,
}) => {
  if (operation == 'read' && args.select) {
    const originalSelect = args.select
    const selectedFields = Object.keys(args.select)

    if (
      selectedFields.includes('path') ||
      selectedFields.includes('breadcrumbs') ||
      selectedFields.includes('meta') // the alternatePaths field is part of the meta group
    ) {
      const pageConfig = asPageCollectionConfigOrThrow(args.collection.config)

      // Select the parent, slug and breadcrumbLabelField fields, as they are required for the setVirtualFields hook to work.
      args.select = {
        ...args.select,
        ...requiredFields(pageConfig).reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      }

      // Store the original select in the context to be able to remove fields that were added by the hook later on
      context.originalSelect = originalSelect
    }
  }

  // Make the select object available to the setVirtualFields hook by adding it to the context
  context.select = args.select

  return args
}
