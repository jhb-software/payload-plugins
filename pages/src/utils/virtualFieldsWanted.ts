import type { RequestContext } from 'payload'

const KEY = 'generateVirtualFields'

/**
 * Whether an operation on the given collection asked for the virtual fields.
 *
 * `beforeRead` has no access to the operation's `select` (Payload does not pass it, see
 * https://github.com/payloadcms/payload/issues/16180), so the decision has to be made in
 * `beforeOperation` and carried on `req.context`. A request outlives
 * the operation that wrote it, so the answer is kept per collection: a read of one page
 * collection cannot make the plugin compute virtual fields for a read of another one that never
 * asked for them.
 *
 * The mark is only ever set, never cleared. Clearing it would have to happen in
 * `beforeOperation` too, where a concurrent operation on the same collection could clear it
 * between another operation's `beforeOperation` and its `beforeRead` — turning wasted work into
 * a missing `path`.
 *
 * TODO: once payloadcms/payload#16180 ships, drop this module and read `select` straight from the
 * hook args in `setVirtualFieldsBeforeRead`.
 */
export function virtualFieldsWanted(context: RequestContext, collectionSlug: string): boolean {
  return (context[KEY] as Record<string, boolean> | undefined)?.[collectionSlug] === true
}

/** Records that the virtual fields of the given collection are to be generated. */
export function markVirtualFieldsWanted(context: RequestContext, collectionSlug: string): void {
  context[KEY] = {
    ...(context[KEY] as Record<string, boolean> | undefined),
    [collectionSlug]: true,
  }
}
