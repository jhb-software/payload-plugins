import type { CollectionSlug, Field } from 'payload'

import type { AltTextResolver } from '../resolvers/types.js'

/** Configuration options for the alt text plugin. */
export type IncomingAltTextPluginConfig = {
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
   * The locale to generate alt texts in when localization is disabled.
   * Required when localization is disabled, ignored when localization is enabled.
   * @example 'en', 'de'
   */
  locale?: string

  /** Maximum number of concurrent API requests for bulk operations. */
  maxBulkGenerateConcurrency?: number

  /** The resolver to use for generating alt text (e.g., openAIResolver) */
  resolver: AltTextResolver
}

/** Configuration of the alt text plugin after defaults have been applied. */
export type AltTextPluginConfig = {
  /** Collection slugs to enable the plugin for. */
  collections: CollectionSlug[]

  /** Whether the plugin is enabled. */
  enabled: boolean

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /** Function to get the thumbnail URL of an image document. */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** The locale to generate alt texts in when localization is disabled. */
  locale?: string

  /** The locales to generate alt texts for. */
  locales: string[]

  /** Maximum number of concurrent API requests for bulk generate operations. */
  maxBulkGenerateConcurrency: number

  /** The resolver to use for generating alt text */
  resolver: AltTextResolver
}
