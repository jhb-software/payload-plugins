import { Field } from 'payload'

/** Configuration options for the alt text plugin. */
export type IncomingAltTextPluginConfig = {
  /** Whether the plugin is enabled. */
  enabled?: boolean

  /** OpenAI API key for authentication. */
  openAIApiKey: string

  /** Collection slugs to enable the plugin for. */
  collections: string[]

  /** Maximum number of concurrent API requests for bulk operations. */
  maxBulkGenerateConcurrency?: number

  /**
   * Function to get the thumbnail URL of an image document.
   * This URL will be sent to the LLM for analysis.
   *
   * @remarks
   * - The URL must be publicly accessible so the LLM can fetch it
   * - Use a thumbnail/preview version of the image when possible (e.g. from the sizes field)
   */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** The OpenAI LLM model to use for alt text generation. */
  model?: 'gpt-4.1-nano' | 'gpt-4.1-mini'

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]
}

/** Configuration of the alt text plugin after defaults have been applied. */
export type AltTextPluginConfig = {
  /** Whether the plugin is enabled. */
  enabled: boolean

  /** OpenAI API key for authentication. */
  openAIApiKey: string

  /** Collection slugs to enable the plugin for. */
  collections: string[]

  /** Maximum number of concurrent API requests for bulk generate operations. */
  maxBulkGenerateConcurrency: number

  /** Function to get the thumbnail URL of an image document. */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** The OpenAI LLM model to use for alt text generation. */
  model: 'gpt-4.1-nano' | 'gpt-4.1-mini'

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /** The locales to generate alt texts for. */
  locales: string[]
}
