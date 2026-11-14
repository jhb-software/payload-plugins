import type { TranslateInstructions } from './createPromptResolver.js'
import type { TranslateResolver } from './types.js'

import { createOpenAICompatibleResolver } from './openAICompatible.js'

export type OpenAIResolverConfig = {
  apiKey: string
  /**
   * Origin of an OpenAI-compatible API, without the `/v1/chat/completions` path.
   * @default 'https://api.openai.com'
   */
  baseUrl?: string
  /**
   * How many texts to include into 1 request
   * @default 100
   */
  chunkLength?: number
  /**
   * Builds the instructions from the default ones, e.g. to append protected
   * terms. Sent as the system message, separately from the texts.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: TranslateInstructions
  /**
   * @default "gpt-4o-mini"
   */
  model?: string
}

export const openAIResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  instructions,
  model = 'gpt-4o-mini',
}: OpenAIResolverConfig): TranslateResolver =>
  createOpenAICompatibleResolver({
    apiKey,
    // Falsy rather than nullish: a config written as `process.env.X || ''`
    // has always fallen back to the default host, and still must.
    baseUrl: baseUrl || 'https://api.openai.com',
    chunkLength,
    instructions,
    key: 'openai',
    label: 'OpenAI',
    model,
  })
