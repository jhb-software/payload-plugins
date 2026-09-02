import type { VisionInstructions } from './createVisionResolver.js'
import type { AltTextResolver } from './types.js'

import { createVisionResolver, VisionProviderError } from './createVisionResolver.js'

export type MistralResolverConfig = {
  /** Mistral API key for authentication */
  apiKey: string
  /**
   * Base URL of the Mistral API.
   * @default 'https://api.mistral.ai/v1'
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
   * The vision-capable Mistral model to use for alt text generation.
   *
   * Must be able to read images — `mistral-medium-latest`,
   * `mistral-large-latest`, `mistral-small-latest` and the `ministral-*` models
   * all are.
   *
   * @default 'mistral-medium-latest'
   */
  model?: string
  /**
   * Abort after this many milliseconds. Covers downloading the image and the
   * completion call together.
   * @default 30000
   */
  timeoutMs?: number
}

/**
 * Image formats the Mistral API accepts.
 *
 * Narrower than what an upload collection may hold — SVG and AVIF are missing,
 * so the endpoint rejects those documents and their generate button stays
 * disabled instead of failing at the provider.
 *
 * @see https://docs.mistral.ai/capabilities/vision/
 */
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * Creates a Mistral-based resolver for alt text generation.
 *
 * The image is downloaded and sent as bytes rather than handed to Mistral as a
 * URL. Mistral's own fetcher requires a publicly reachable file — never true in
 * local development, and not true for private buckets — and some hosts refuse it
 * outright, which surfaces as `File could not be fetched from url` (error 3310).
 *
 * @example
 * ```typescript
 * import { mistralResolver } from '@jhb.software/payload-alt-text-plugin'
 *
 * mistralResolver({
 *   apiKey: process.env.MISTRAL_API_KEY,
 *   model: 'mistral-medium-latest', // optional, this is the default
 * })
 * ```
 */
export const mistralResolver = ({
  apiKey,
  baseUrl = 'https://api.mistral.ai/v1',
  instructions,
  model = 'mistral-medium-latest',
  timeoutMs = 30_000,
}: MistralResolverConfig): AltTextResolver =>
  createVisionResolver({
    apiKey,
    generate: async ({
      filename,
      image,
      instructions: resolvedInstructions,
      maxTokens,
      responseSchema,
      signal,
    }) => {
      if (!image) {
        throw new Error('The image was not downloaded')
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: maxTokens,
          messages: [
            { content: resolvedInstructions, role: 'system' },
            {
              content: [
                { type: 'image_url', image_url: image.dataUri },
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
        // Bounded: unbounded provider text would land in the log as-is.
        const body = (await response.text().catch(() => '')).slice(0, 500)

        throw new VisionProviderError({ body, label: 'Mistral', status: response.status })
      }

      const completion = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: unknown } }[]
      }
      const choice = completion.choices?.[0]

      if (choice?.finish_reason === 'length') {
        throw new Error(
          `Mistral ran out of tokens before finishing the alt text (max_tokens: ${maxTokens})`,
        )
      }

      const content = choice?.message?.content

      if (typeof content !== 'string') {
        throw new Error('No result from Mistral')
      }

      try {
        return JSON.parse(content)
      } catch {
        throw new Error('Mistral returned a response that was not valid JSON')
      }
    },
    inlineImage: true,
    instructions,
    key: 'mistral',
    label: 'Mistral',
    // Mistral rejects images above 20 MB.
    maxImageBytes: 20 * 1024 * 1024,
    supportedMimeTypes: SUPPORTED_MIME_TYPES,
    timeoutMs,
  })
