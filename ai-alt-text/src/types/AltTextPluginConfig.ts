/** Configuration options for the AI alt text plugin. */
export type IncomingAltTextPluginConfig = {
  /** Whether the AI alt text plugin is enabled. */
  enabled?: boolean

  /** OpenAI API key for authentication. */
  openAIApiKey: string

  /** Collection slugs to enable AI alt text generation for. */
  collections: string[]

  /** Maximum number of concurrent API requests for bulk operations. */
  maxConcurrency?: number

  /**
   * Function to get the thumbnail URL of an image.
   * This URL will be sent to the LLM for analysis.
   *
   * @remarks
   * - The URL must be publicly accessible so the LLM can fetch it
   * - Use a thumbnail/preview version of the image when possible (e.g. from the sizes field)
   */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** The OpenAI LLM model to use for alt text generation. */
  model?: 'gpt-4.1-nano' | 'gpt-4.1-mini'
}

/** Configuration of the AI alt text plugin after defaults have been applied. */
export type AltTextPluginConfig = {
  /** Whether the AI alt text plugin is enabled. */
  enabled: boolean

  /** OpenAI API key for authentication. */
  openAIApiKey: string

  /** Collection slugs to enable AI alt text generation for. */
  collections: string[]

  /** Maximum number of concurrent API requests for bulk operations. */
  maxConcurrency: number

  /** Function to get the thumbnail URL of an image. */
  getImageThumbnail: (doc: Record<string, unknown>) => string

  /** The OpenAI LLM model to use for alt text generation. */
  model: 'gpt-4.1-nano' | 'gpt-4.1-mini'

  /** The locales to generate alt text for. */
  locales: string[]
}
