import type { VisionInstructions } from './createVisionResolver.js'
import type { AltTextResolver } from './types.js'

import { createVisionResolver, VisionProviderError } from './createVisionResolver.js'

export type OpenAIResolverConfig = {
  /** OpenAI API key for authentication */
  apiKey: string
  /**
   * Base URL for the OpenAI-compatible API, including the version segment.
   * Use this to point at alternative providers (e.g. Azure, Nebius, local inference).
   * @default 'https://api.openai.com/v1'
   */
  baseUrl?: string
  /**
   * Builds the instructions from the default ones, e.g. to append a house style
   * rule. Sent as the system message, separately from the image.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: VisionInstructions
  /**
   * The OpenAI LLM model to use for alt text generation.
   * @default 'gpt-4.1-nano'
   */
  model?: string
  /**
   * The MIME types the provider accepts for the image URL.
   *
   * Defaults to the formats documented for OpenAI's vision models. Override it
   * when pointing `baseUrl` at another provider whose accepted formats differ —
   * the person choosing the provider is the one who knows.
   *
   * @default ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
   */
  supportedMimeTypes?: string[]
  /**
   * Abort after this many milliseconds, covering the completion call and the
   * retries the factory makes within it.
   * @default 30000
   */
  timeoutMs?: number
}

/** @see https://platform.openai.com/docs/guides/images-vision */
const OPENAI_SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * Creates an OpenAI-based resolver for alt text generation.
 *
 * The thumbnail URL is handed to OpenAI, which fetches it itself — so the URL
 * has to be reachable from the public internet. Behind a private bucket or in
 * local development, reach for a resolver that inlines the bytes instead
 * (`mistralResolver`, `anthropicResolver`).
 *
 * @example
 * ```typescript
 * import { openAIResolver } from '@jhb.software/payload-alt-text-plugin'
 *
 * // OpenAI
 * openAIResolver({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4.1-mini', // optional, defaults to 'gpt-4.1-nano'
 * })
 *
 * // OpenAI-compatible provider (e.g. Nebius)
 * openAIResolver({
 *   apiKey: process.env.NEBIUS_API_KEY,
 *   baseUrl: 'https://api.tokenfactory.us-central1.nebius.com/v1',
 *   model: 'Qwen/Qwen2.5-VL-72B-Instruct',
 * })
 * ```
 */
export const openAIResolver = ({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  instructions,
  model = 'gpt-4.1-nano',
  supportedMimeTypes = OPENAI_SUPPORTED_MIME_TYPES,
  timeoutMs = 30_000,
}: OpenAIResolverConfig): AltTextResolver =>
  createVisionResolver({
    apiKey,
    generate: async ({
      filename,
      imageThumbnailUrl,
      instructions: resolvedInstructions,
      maxTokens,
      responseSchema,
      signal,
    }) => {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_completion_tokens: maxTokens,
          messages: [
            { content: resolvedInstructions, role: 'system' },
            {
              content: [
                { type: 'image_url', image_url: { url: imageThumbnailUrl } },
                ...(filename ? [{ type: 'text', text: filename }] : []),
              ],
              role: 'user',
            },
          ],
          model,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'data', schema: responseSchema, strict: true },
          },
        }),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
        signal,
      })

      if (!response.ok) {
        // Bounded: the body is provider text rendered in the admin panel.
        const body = (await response.text().catch(() => '')).slice(0, 500)

        throw new VisionProviderError({ body, label: 'OpenAI', status: response.status })
      }

      const completion = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: unknown } }[]
      }
      const choice = completion.choices?.[0]

      // A budget exhausted mid-JSON otherwise reaches JSON.parse and reads as
      // "Unexpected end of JSON input" in the admin panel, which tells an editor
      // nothing about what to change.
      if (choice?.finish_reason === 'length') {
        throw new Error(
          `OpenAI ran out of tokens before finishing the alt text (max_completion_tokens: ${maxTokens})`,
        )
      }

      const content = choice?.message?.content

      if (typeof content !== 'string') {
        throw new Error('No result from OpenAI')
      }

      try {
        return JSON.parse(content)
      } catch {
        throw new Error('OpenAI returned a response that was not valid JSON')
      }
    },
    instructions,
    key: 'openai',
    label: 'OpenAI',
    supportedMimeTypes,
    timeoutMs,
  })
