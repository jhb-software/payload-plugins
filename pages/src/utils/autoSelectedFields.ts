/**
 * Symbol under which the fields the plugin added to the caller's `select` are recorded.
 *
 * The record lives on the operation `args` object — which Payload hands to both the
 * `beforeOperation` and the `afterOperation` hook of the same operation — instead of on
 * `req.context`. Nested reads that run while an operation is in flight (relationship
 * population above all) share the request context but carry their own args, so keying on
 * args prevents a nested read from stripping fields off the outer response, or vice versa.
 */
const AUTO_SELECTED_FIELDS = Symbol('pagesPluginAutoSelectedFields')

/** Records the fields which the plugin added to the caller's `select` for the given operation. */
export function recordAutoSelectedFields(args: object, fields: string[]): void {
  ;(args as Record<symbol, string[]>)[AUTO_SELECTED_FIELDS] = fields
}

/** Returns the fields which the plugin added to the caller's `select` for the given operation. */
export function readAutoSelectedFields(args: object): string[] | undefined {
  return (args as Record<symbol, string[] | undefined>)[AUTO_SELECTED_FIELDS]
}
