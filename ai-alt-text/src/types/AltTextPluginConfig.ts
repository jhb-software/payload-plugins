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

  /** The OpenAI LLM model to use for alt text generation. */
  model?: 'gpt-4o-mini' | 'gpt-4o-2024-08-06'
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

  /** The OpenAI LLM model to use for alt text generation. */
  model: 'gpt-4o-mini' | 'gpt-4o-2024-08-06'
}
