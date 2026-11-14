import type { CollectionAfterOperationHook } from 'payload'

import { restoreOperationDraft } from '../utils/operationContext.js'

/**
 * A CollectionAfterOperationHook that gives the enclosing operation its draft mode back, so an
 * operation nested inside it — a `localeRouting` resolver or a user hook reading a page
 * collection with the same request — cannot decide which ancestors the outer one resolves.
 */
export const restoreOperationDraftAfterOperation: CollectionAfterOperationHook = ({
  args,
  req,
  result,
}) => {
  restoreOperationDraft(args, req.context)
  return result
}
