import type { TranslateInstructions } from './createPromptResolver.js'
import type { TranslateResolver } from './types.js'

import { createOpenAICompatibleResolver } from './openAICompatible.js'

export type MistralResolverConfig = {
  apiKey: string
  /**
   * Origin of the Mistral API, without the `/v1/chat/completions` path.
   * @default 'https://api.mistral.ai'
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
   * @default "mistral-medium-latest"
   */
  model?: string
}

/**
 * Creates a Mistral-based translation resolver.
 *
 * Mistral serves OpenAI's chat completions shape, so this is `openAIResolver`
 * with Mistral's base URL and model default — it exists so a Mistral setup does
 * not have to know that.
 *
 * @example
 * ```typescript
 * import { mistralResolver } from '@jhb.software/payload-content-translator-plugin'
 *
 * mistralResolver({
 *   apiKey: process.env.MISTRAL_API_KEY!,
 *   model: 'mistral-medium-latest', // optional, this is the default
 * })
 * ```
 */
export const mistralResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  instructions,
  model = 'mistral-medium-latest',
}: MistralResolverConfig): TranslateResolver =>
  createOpenAICompatibleResolver({
    apiKey,
    // Falsy rather than nullish, so a `process.env.X || ''` config reaches the
    // default host instead of a relative URL.
    baseUrl: baseUrl || 'https://api.mistral.ai',
    chunkLength,
    instructions,
    key: 'mistral',
    label: 'Mistral',
    model,
  })
