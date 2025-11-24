import { CollectionBeforeOperationHook } from 'payload'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { dependentFields } from './setVirtualFields.js'
import { getSelectMode } from 'payload/shared'
import { hasVirtualFieldSelected } from '../utils/hasVirtualFieldSelected.js'

/**
 * A CollectionBeforeOperationHook that alters the select in case a virtual field is selected.
 *
 * This is ensures that all fields that are required to generate the virtual fields are selected.
 * Also passes the select to the context to make it available to the setVirtualFields (afterRead) hook.
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
    const hasVirtualFieldsSelected = hasVirtualFieldSelected(args.select)

    if (hasVirtualFieldsSelected && selectMode === 'include') {
      // extend the select with the required fields
      args.select = {
        ...args.select,
        ...dependendSelectedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      }
    } else if (hasVirtualFieldsSelected && selectMode === 'exclude') {
      // min one of the virtual fields needs to be generated
      // -> remove deselection of the required fields
      args.select = Object.fromEntries(
        Object.entries(args.select).filter(([field]) => !dependendSelectedFields.includes(field)),
      )

      // if select is empty now, set it to undefined, because an empty select would select nothing
      if (Object.keys(args.select).length === 0) {
        args.select = undefined
      }
    }
  }

  // Make the select available to the setVirtualFields (afterRead) hook
  context.select = args.select

  return args
}
