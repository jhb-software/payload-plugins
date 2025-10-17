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
  // // TODO: args.id will be undefined for findMany operations but data.id will be defined in the afterOperation hook
  // // this means for findMany operations, removing the originally unselected fields will not work
  context.rootOperation = `${args.id}-${args.collection.config.slug}`

  // Make the select object available to the setVirtualFields hook by adding it to the context
  context.select = args.select

  if (operation == 'read' && args.select) {
    const originalSelect = args.select
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

        const parentFieldName = pageConfig.page.parent.name
        const parentCollectionSlug = pageConfig.page.parent.collection

        // when the user has not selected the parent field, but the parent field is added above, only populate the breadcrumbs field of it.
        if (!originalSelect[parentFieldName]) {
          args.populate = {
            ...args.populate,

            // only populate the breadcrumbs field of the parent field, otherwise, for every read operation, all fields of the parent would be unecessaryly returned
            [parentCollectionSlug]: {
              breadcrumbs: true,
              ...args.populate?.[parentCollectionSlug],
            },
          }
        }

        // Store the original select so that deleteUnselectedFieldsAfterRead can properly handle field exclusion
        context.originalSelect = originalSelect

        // Make the modified select available to the setVirtualFields hook
        context.select = args.select

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
