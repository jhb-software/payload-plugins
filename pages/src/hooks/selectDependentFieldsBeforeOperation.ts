import { CollectionBeforeOperationHook } from 'payload'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { dependentFields } from './setVirtualFields.js'
import { getSelectMode } from 'payload/shared'

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
  if (operation == 'read' && args.select) {
    const pageConfig = asPageCollectionConfigOrThrow(args.collection.config)
    const selectMode = getSelectMode(args.select)
    const dependendSelectedFields = dependentFields(pageConfig)

    if (selectMode === 'include') {
      const selectedFields = Object.keys(args.select)

      const virtualFields = ['path', 'breadcrumbs', 'meta']
      const hasVirtualFieldsSelected = virtualFields.some((field) => selectedFields.includes(field))

      if (hasVirtualFieldsSelected) {
        // extend the select with the required fields
        args.select = {
          ...args.select,
          ...dependendSelectedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
        }

        // Indicate that the virtual fields should be generated in the setVirtualFields hook
        context.generateVirtualFields = true
      }
    } else if (selectMode === 'exclude') {
      const selectedFields = Object.keys(args.select)
      const virtualFields = ['path', 'breadcrumbs', 'meta']
      const allVirtualFieldsDeselected = virtualFields.every((field) =>
        selectedFields.includes(field),
      )

      if (!allVirtualFieldsDeselected) {
        // min one of the virtual fields needs to be generated
        // -> remove deselection of the required fields
        args.select = Object.fromEntries(
          Object.entries(args.select).filter(([field]) => !dependendSelectedFields.includes(field)),
        )

        // if select is empty now, set it to undefined, because an empty select would select nothing
        if (Object.keys(args.select).length === 0) {
          args.select = undefined
        }

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
