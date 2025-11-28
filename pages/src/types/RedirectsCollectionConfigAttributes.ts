import type { PayloadRequest, Where } from 'payload'

/** The redirects collection config attributes as provided by the user. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RedirectsCollectionConfigAttributes = {}

/** The redirects collection config attributes after sanitization (defaults applied, validated). */
export type SanitizedRedirectsCollectionConfigAttributes = {
  /**
   * The filter to apply to find queries when validating redirects.
   *
   * This is copied from the plugin config during sanitization.
   */
  redirectValidationFilter?: (args: { doc: unknown; req: PayloadRequest }) => Where
}
