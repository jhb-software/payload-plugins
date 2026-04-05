import type { CollectionSlug, Field, PayloadRequest } from 'payload'

import type { AltTextResolver } from '../resolvers/types.js'

/** Configuration options for the alt text plugin. */
export type IncomingAltTextPluginConfig = {
  /**
   * Custom access control for plugin endpoints.
   * Return `true` to allow access, `false` to deny.
   *
   * @default ({ req }) => !!req.user — requires authentication
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /** Collection slugs to enable the plugin for. */
  collections: CollectionSlug[]

  /** Whether the plugin is enabled. */
  enabled?: boolean

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /**
   * Function to get the thumbnail URL of an image document.
   * This URL will be sent to the LLM for analysis.
   *
   * @remarks
   * - The URL must be publicly accessible so the LLM can fetch it
   * - Use a thumbnail/preview version of the image when possible (e.g. from the sizes field)
   */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /**
   * Enable alt text health tracking (REST endpoint, cache revalidation hooks, and dashboard widget).
   * Set to `false` to disable the entire feature.
   *
   * @default true
   */
  healthCheck?: boolean

  /**
   * The locale to generate alt texts in when localization is disabled.
   *
   * Required when localization is disabled, ignored when localization is enabled.
   * @example 'en'
   */
  locale?: string

  /**
   * Maximum number of concurrent API requests for bulk generate operations.
   *
   * @default 16
   */
  maxBulkGenerateConcurrency?: number

  /** The resolver to use for generating alt text (e.g., openAIResolver) */
  resolver: AltTextResolver
}

/** Configuration of the alt text plugin after defaults have been applied. */
export type AltTextPluginConfig = {
  /** Access control for plugin endpoints. */
  access: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /** Collection slugs to enable the plugin for. */
  collections: CollectionSlug[]

  /** Whether the plugin is enabled. */
  enabled: boolean

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /** Function to get the thumbnail URL of an image document. */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** Whether alt text health tracking is enabled. */
  healthCheck: boolean

  /** The locale to generate alt texts in when localization is disabled. */
  locale?: string

  /** The locales to generate alt texts for. */
  locales: string[]

  /** Maximum number of concurrent API requests for bulk generate operations. */
  maxBulkGenerateConcurrency: number

  /** The resolver to use for generating alt text */
  resolver: AltTextResolver
}
