import type { CollectionAfterOperationHook } from 'payload'

import { readAutoSelectedFields } from '../utils/autoSelectedFields.js'

/**
 * A CollectionAfterOperationHook that removes the fields which
 * `selectDependentFieldsBeforeOperation` added to the caller's `select` from the result, so a
 * response never contains a field the caller did not ask for.
 *
 * An `afterOperation` hook is used (rather than an `afterRead` hook), because it is the only
 * point that runs after every consumer of the dependent fields:
 * - during create/update Payload applies `select` and runs the `afterRead` hooks *before* the
 *   `afterChange` hooks, where `setVirtualFieldsAfterChange` still needs the dependent fields
 * - relationship population fires the `afterRead` hooks of the populated documents as part of
 *   the surrounding operation, which must not strip fields off those documents
 */
export const stripAutoSelectedFieldsAfterOperation: CollectionAfterOperationHook = ({
  args,
  result,
}) => {
  const fields = readAutoSelectedFields(args)

  if (!fields?.length || !result || typeof result !== 'object') {
    return result
  }

  if ('docs' in result && Array.isArray(result.docs)) {
    for (const doc of result.docs) {
      stripFields(doc, fields)
    }
  } else {
    stripFields(result, fields)
  }

  return result
}

/** Deletes the given fields from the document. */
function stripFields(doc: unknown, fields: string[]): void {
  if (!doc || typeof doc !== 'object') {
    return
  }

  for (const field of fields) {
    delete (doc as Record<string, unknown>)[field]
  }
}
