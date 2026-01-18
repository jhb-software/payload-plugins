import type { CollectionBeforeOperationHook } from 'payload'

import { getSelectMode } from 'payload/shared'

import { hasVirtualFieldSelected } from '../utils/hasVirtualFieldSelected.js'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { dependentFields } from './setVirtualFields.js'

/**
 * A CollectionBeforeOperationHook that alters the select in case a virtual field is selected
 * to ensure that the fields the setVirtualFields hook depends on to correctly generate
 * the virtual fields are also selected.
 */
export const selectDependentFieldsBeforeOperation: CollectionBeforeOperationHook = ({
  args,
  context,
  operation,
}) => {
  // Workaround for a bug in Payload 3.67.0 (see https://github.com/payloadcms/payload/issues/14847)
  // where operation is undefined for findByID operations. This bug is fixed in v3.68.0.
  const isReadOperation =
    operation === 'read' || (operation === undefined && 'id' in args && 'collection' in args)

  if (isReadOperation && args.select) {
    const pageConfig = asPageCollectionConfigOrThrow(args.collection.config)
    const selectMode = getSelectMode(args.select)
    const dependendSelectedFields = dependentFields(pageConfig)
    const hasVirtualFieldsSelected = hasVirtualFieldSelected(args.select)

    if (hasVirtualFieldsSelected && selectMode === 'include') {
      // extend the select with the dependent fields
      args.select = {
        ...args.select,
        ...dependendSelectedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      }

      // Indicate that the virtual fields should be generated in the setVirtualFields hook
      context.generateVirtualFields = true
    } else if (hasVirtualFieldsSelected && selectMode === 'exclude') {
      // remove deselection of the dependent fields
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
  } else if (isReadOperation && !args.select) {
    // Indicate that the virtual fields should be generated in the setVirtualFields hook
    // if no select is provided
    context.generateVirtualFields = true
  }

  return args
}
