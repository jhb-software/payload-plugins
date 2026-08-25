import type { RequestContext } from 'payload'

/**
 * State that `beforeOperation` records for the hooks running later in the same operation.
 *
 * Payload hands `beforeRead`, `beforeChange` and `afterChange` neither the operation's `select`
 * nor its `draft` (https://github.com/payloadcms/payload/issues/16180), so both are read in
 * `beforeOperation` and carried on `req.context`. That context belongs to the request, which
 * outlives the operation that wrote it — hence the scoping below.
 *
 * TODO: once that issue ships, drop this module and read `select` and `draft` off the hook args.
 */

const DRAFT_KEY = 'draft'
const WANTED_KEY = 'generateVirtualFields'

/**
 * Records the draft mode of the operation that is about to run.
 *
 * Only correct for operations that do not overlap: an operation nested inside another one — a
 * hook calling the local API on the same request — overwrites the outer operation's mode for
 * the hooks that still have to run. Reading the mode as early as possible narrows that window
 * but cannot close it.
 */
export function setOperationDraft(context: RequestContext, draft: unknown): void {
  context[DRAFT_KEY] = draft === true
}

/** Whether the current operation resolves documents to their latest version. */
export function operationDraft(context: RequestContext): boolean {
  return context[DRAFT_KEY] === true
}

/** Whether an operation on the given collection asked for the virtual fields. */
export function virtualFieldsWanted(context: RequestContext, collectionSlug: string): boolean {
  return (context[WANTED_KEY] as Record<string, boolean> | undefined)?.[collectionSlug] === true
}

/**
 * Records that the virtual fields of the given collection are to be generated.
 *
 * Kept per collection so a read of one page collection cannot make the plugin compute virtual
 * fields for a read of another one that never asked for them. The mark is only ever set, never
 * cleared: clearing would have to happen in `beforeOperation` too, where a concurrent operation
 * on the same collection could clear it between another operation's `beforeOperation` and its
 * `beforeRead` — turning wasted work into a missing `path`.
 */
export function markVirtualFieldsWanted(context: RequestContext, collectionSlug: string): void {
  const wanted = (context[WANTED_KEY] as Record<string, boolean> | undefined) ?? {}
  wanted[collectionSlug] = true
  context[WANTED_KEY] = wanted
}
