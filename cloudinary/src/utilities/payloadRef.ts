import type { Payload } from 'payload'

/**
 * Holds the Payload instance of the config the plugin was applied to.
 *
 * Some cloud-storage adapter callbacks (e.g. `generateURL`) receive neither a request nor a
 * Payload instance, so the plugin captures it in `onInit` and reads it back through this ref to
 * be able to log through `payload.logger`.
 */
export type PayloadRef = { current?: Payload }
