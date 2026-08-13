import type { CollectionBeforeOperationHook } from 'payload'

import { getSelectMode } from 'payload/shared'

import { recordAutoSelectedFields } from '../utils/autoSelectedFields.js'
import { hasVirtualFieldSelected } from '../utils/hasVirtualFieldSelected.js'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { dependentFields } from './setVirtualFields.js'

/**
 * A CollectionBeforeOperationHook that alters the select in case a virtual field is selected
 * to ensure that the fields the setVirtualFields hook depends on to correctly generate
 * the virtual fields are also selected.
 *
 * Every field which is selected here on the plugin's own behalf is recorded on the operation
 * args, so `stripAutoSelectedFieldsAfterOperation` can remove it from the response again —
 * a caller must only receive the fields it asked for.
 */
export const selectDependentFieldsBeforeOperation: CollectionBeforeOperationHook = ({
  args,
  context,
  operation,
}) => {
  // Store the draft arg on the context so downstream hooks (e.g. getBreadcrumbs → findByIDCached)
  // can pass it when fetching parent documents.
  if ('draft' in args) {
    context.draft = args.draft
  }

  // Workaround for a bug in Payload 3.67.0 (see https://github.com/payloadcms/payload/issues/14847)
  // where operation is undefined for findByID operations. This bug is fixed in v3.68.0.
  const isReadOperation =
    operation === 'read' || (operation === undefined && 'id' in args && 'collection' in args)

  // For create/update operations, Payload applies `select` via `afterRead` hooks *before*
  // calling `afterChange` hooks. This means the doc received by `setVirtualFieldsAfterChange`
  // will have its fields stripped by `select`. We need to ensure dependent fields survive
  // the filtering so that virtual fields can still be computed.
  const isMutationOperation = operation === 'create' || operation === 'update'

  if ((isReadOperation || isMutationOperation) && args.select) {
    const pageConfig = asPageCollectionConfigOrThrow(args.collection.config)
    const selectMode = getSelectMode(args.select)
    const dependendSelectedFields = dependentFields(pageConfig)
    const hasVirtualFieldsSelected = hasVirtualFieldSelected(args.select)

    if (hasVirtualFieldsSelected && selectMode === 'include') {
      const select = args.select
      // Fields the caller selected itself must not be stripped from the response afterwards
      const addedFields = dependendSelectedFields.filter((field) => !select[field])

      // extend the select with the dependent fields
      args.select = {
        ...args.select,
        ...addedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      }

      recordAutoSelectedFields(args, addedFields)

      // Indicate that the virtual fields should be generated in the setVirtualFields hook
      context.generateVirtualFields = true
    } else if (hasVirtualFieldsSelected && selectMode === 'exclude') {
      const deselectedFields = dependendSelectedFields.filter((field) => field in args.select!)

      // remove deselection of the dependent fields
      args.select = Object.fromEntries(
        Object.entries(args.select).filter(([field]) => !dependendSelectedFields.includes(field)),
      )

      // if select is empty now, set it to undefined, because an empty select would select nothing
      if (Object.keys(args.select).length === 0) {
        args.select = undefined
      }

      recordAutoSelectedFields(args, deselectedFields)

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
