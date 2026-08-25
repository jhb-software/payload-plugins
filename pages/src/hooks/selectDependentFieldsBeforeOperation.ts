import type { CollectionBeforeOperationHook } from 'payload'

import { getSelectMode } from 'payload/shared'

import { recordAutoSelectedFields } from '../utils/autoSelectedFields.js'
import { hasVirtualFieldSelected, virtualFieldNames } from '../utils/hasVirtualFieldSelected.js'
import { asPageCollectionConfigOrThrow } from '../utils/pageCollectionConfigHelpers.js'
import { markVirtualFieldsWanted } from '../utils/virtualFieldsWanted.js'
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
  // Store the draft arg on the context so `setVirtualFields` can hand it to the ancestor walk.
  // `beforeRead` receives no `draft`, so the context is the only channel from here
  // (see https://github.com/payloadcms/payload/issues/16180).
  // TODO: once that issue ships, read `draft` from the hook args instead of the context.
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

    // On a read the virtual fields are only computed when the caller asked for one, so the
    // dependent fields are only needed then. On a mutation `setVirtualFieldsAfterChange` runs
    // regardless of the select and hands its result to every downstream afterChange hook, so
    // the dependent fields must survive the select filtering whatever the caller selected.
    const needsDependentFields = isMutationOperation || hasVirtualFieldsSelected

    // `setVirtualFieldsAfterChange` writes all virtual fields onto the document *after* Payload
    // has applied the select, so on a mutation every virtual field the select did not ask for
    // would reach the caller regardless. Strip exactly those alongside the dependent fields.
    // (On a read the select is applied after `setVirtualFieldsBeforeRead`, so Payload removes
    // them itself and there is nothing to strip.)
    const callerSelect = args.select
    const unselectedVirtualFields = !isMutationOperation
      ? []
      : selectMode === 'include'
        ? virtualFieldNames.filter((field) => !callerSelect[field])
        : virtualFieldNames.filter((field) => field in callerSelect)

    if (needsDependentFields && selectMode === 'include') {
      const select = args.select
      // Fields the caller selected itself must not be stripped from the response afterwards
      const addedFields = dependendSelectedFields.filter((field) => !select[field])

      // extend the select with the dependent fields
      args.select = {
        ...args.select,
        ...addedFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}),
      }

      recordAutoSelectedFields(args, [...addedFields, ...unselectedVirtualFields])
    } else if (needsDependentFields && selectMode === 'exclude') {
      const deselectedFields = dependendSelectedFields.filter((field) => field in args.select!)

      // remove deselection of the dependent fields
      args.select = Object.fromEntries(
        Object.entries(args.select).filter(([field]) => !dependendSelectedFields.includes(field)),
      )

      // if select is empty now, set it to undefined, because an empty select would select nothing
      if (Object.keys(args.select).length === 0) {
        args.select = undefined
      }

      recordAutoSelectedFields(args, [...deselectedFields, ...unselectedVirtualFields])
    }

    if (hasVirtualFieldsSelected) {
      // Indicate that the virtual fields should be generated in the setVirtualFields hook.
      // Deliberately not set for a mutation which selected no virtual field: the afterChange
      // hook computes them without consulting the mark, while a nested read sharing this
      // request context must not start computing virtual fields nobody asked for.
      markVirtualFieldsWanted(context, args.collection.config.slug)
    }
  } else if (isReadOperation && !args.select) {
    // Indicate that the virtual fields should be generated in the setVirtualFields hook
    // if no select is provided
    markVirtualFieldsWanted(context, args.collection.config.slug)
  }

  return args
}
