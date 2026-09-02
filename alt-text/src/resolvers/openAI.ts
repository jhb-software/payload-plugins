import type { ChatCompletionContentPartText } from 'openai/resources/chat/completions.mjs'

import OpenAI from 'openai'

import type { VisionInstructions } from './createVisionResolver.js'
import type { AltTextResolver } from './types.js'

import { createVisionResolver } from './createVisionResolver.js'

export type OpenAIResolverConfig = {
  /** OpenAI API key for authentication */
  apiKey: string
  /**
   * Base URL for the OpenAI-compatible API.
   * Use this to point at alternative providers (e.g. Azure, Nebius, local inference).
   * @default undefined — the OpenAI SDK defaults to 'https://api.openai.com/v1'
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
   * Abort after this many milliseconds, covering the completion call and any
   * retry the SDK makes within it.
   *
   * Omitted by default, leaving the OpenAI client's own deadline (10 minutes)
   * and its automatic retries in charge. Set it to put a shorter ceiling on a
   * generate request.
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
  baseUrl,
  instructions,
  model = 'gpt-4.1-nano',
  supportedMimeTypes = OPENAI_SUPPORTED_MIME_TYPES,
  timeoutMs,
}: OpenAIResolverConfig): AltTextResolver => {
  // Build the client lazily (once, on first use): the `resolver` argument is
  // evaluated even when the plugin is disabled, so eager construction would
  // throw on a keyless `enabled: !!process.env.OPENAI_API_KEY` setup.
  let openai: OpenAI | undefined
  const getClient = (): OpenAI => (openai ??= new OpenAI({ apiKey, baseURL: baseUrl }))

  return createVisionResolver({
    apiKey,
    generate: async ({
      filename,
      imageThumbnailUrl,
      instructions: resolvedInstructions,
      maxTokens,
      responseSchema,
      signal,
    }) => {
      const response = await getClient().chat.completions.create(
        {
          max_completion_tokens: maxTokens,
          messages: [
            { content: resolvedInstructions, role: 'system' },
            {
              content: [
                { type: 'image_url', image_url: { url: imageThumbnailUrl } },
                ...(filename
                  ? [{ type: 'text', text: filename } as ChatCompletionContentPartText]
                  : []),
              ],
              role: 'user',
            },
          ],
          model,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'data', schema: responseSchema, strict: true },
          },
        },
        { signal },
      )

      const choice = response.choices[0]

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
}
