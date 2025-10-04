import { CollectionBeforeOperationHook } from 'payload'
import { asPageCollectionConfigOrThrow } from '../collections/PageCollectionConfig.js'
import { dependentFields } from './setVirtualFields.js'
import { getSelectType } from '../utils/getSelectType.js'

/**
 * A CollectionBeforeOperationHook that alters the select in case a virtual field is selected
 * to ensure that the fields the setVirtualFields hook depends on to correctly generate
 * the virtual fields are also selected.
 */
export const selectDependentFieldsBeforeOperation: CollectionBeforeOperationHook = async ({
  args,
  operation,
  context,
}) => {
  // Make the select object available to the setVirtualFields hook by adding it to the context
  context.select = args.select

  if (operation == 'read' && args.select) {
    const originalSelect = args.select
    const pageConfig = asPageCollectionConfigOrThrow(args.collection.config)
    const selectType = getSelectType(args.select)
    const dependendSelectedFields = dependentFields(pageConfig)

    if (selectType === 'include') {
      const selectedFields = Object.keys(args.select)

      const virtualFields = ['path', 'breadcrumbs', 'meta']
      const hasVirtualFieldsSelected = virtualFields.some((field) => selectedFields.includes(field))

      if (hasVirtualFieldsSelected) {
        // extend the select with the required fields
        args.select = {
          ...args.select,
          ...dependendSelectedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
        }

        // Store the original select so that deleteUnselectedFieldsAfterRead can properly handle field exclusion
        context.originalSelect = originalSelect

        // Make the modified select available to the setVirtualFields hook
        context.select = args.select

        // Indicate that the virtual fields should be generated in the setVirtualFields hook
        context.generateVirtualFields = true
      }
    } else if (selectType === 'exclude') {
      const selectedFields = Object.keys(args.select)
      const virtualFields = ['path', 'breadcrumbs', 'meta']
      const hasVirtualFieldsDeselected = virtualFields.some((field) =>
        selectedFields.includes(field),
      )

      if (hasVirtualFieldsDeselected) {
        // remove the required fields from the select
        args.select = Object.fromEntries(
          Object.entries(args.select).filter(([field]) => !dependendSelectedFields.includes(field)),
        )

        // Store the original select so that deleteUnselectedFieldsAfterRead can properly handle field exclusion
        context.originalSelect = originalSelect

        // Make the modified select available to the setVirtualFields hook
        context.select = args.select

        // Indicate that the virtual fields should be generated in the setVirtualFields hook
        context.generateVirtualFields = true
      }
    }
  } else if (operation == 'read' && !args.select) {
    // Indicate that the virtual fields should be generated in the setVirtualFields hook
    // if no select is provided
    context.generateVirtualFields = true
  }

  return args
}
