import type { VisionInstructions } from './createVisionResolver.js'
import type { AltTextResolver } from './types.js'

import { createVisionResolver, VisionProviderError } from './createVisionResolver.js'

export type AnthropicResolverConfig = {
  /** Anthropic API key for authentication */
  apiKey: string
  /**
   * Base URL of the Anthropic API.
   * @default 'https://api.anthropic.com'
   */
  baseUrl?: string
  /**
   * Caps how long Claude thinks before answering. Lower effort still thinks on a
   * difficult image, just less than a higher setting would.
   *
   * Describing an image is not a reasoning-heavy task, so `'low'` keeps the
   * spend down on the models that accept it. Omitted, the field is not sent and
   * Claude uses its default (`'high'`) — which also keeps models without effort
   * support, such as `claude-haiku-4-5`, usable.
   */
  effort?: 'high' | 'low' | 'max' | 'medium' | 'xhigh'
  /**
   * Builds the instructions from the default ones, e.g. to append a house style
   * rule. Sent as the system prompt, separately from the image.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: VisionInstructions
  /**
   * The Claude model to use for alt text generation.
   *
   * Must be able to read images. `claude-sonnet-5` is the cheaper choice for a
   * large media library; `claude-haiku-4-5` works too, but only without
   * `effort`.
   *
   * @default 'claude-opus-5'
   */
  model?: string
  /**
   * Abort after this many milliseconds. Covers downloading the image and the
   * message call together.
   * @default 30000
   */
  timeoutMs?: number
}

/**
 * Image formats the Messages API accepts.
 *
 * Narrower than what an upload collection may hold — SVG and AVIF are missing,
 * so the endpoint rejects those documents and their generate button stays
 * disabled instead of failing at the provider.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/vision
 */
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * Claude's 10 MB ceiling is measured on the base64 payload, which inflates the
 * raw bytes by roughly 4/3 — so the guard has to sit at ~7.5 MB of raw image to
 * mean 10 MB on the wire. Checking the raw length against 10 MB would wave
 * through a 9 MB photo that arrives as ~12 MB and is rejected by the provider,
 * costing the download and replacing a readable message with a raw 400.
 */
const MAX_IMAGE_BYTES = Math.floor((10 * 1024 * 1024 * 3) / 4)

/**
 * Room for one alt text and its keywords per locale, plus the thinking tokens
 * Claude spends before answering. A budget sized for the answer alone would be
 * exhausted while reasoning, and the response would be cut off mid-JSON.
 */
const MAX_TOKENS_PER_LOCALE = 2000

type AnthropicMessage = {
  content?: { text?: string; type: string }[]
  stop_reason?: string
}

/**
 * Creates a Claude-based resolver for alt text generation.
 *
 * The image is downloaded and sent as bytes. Claude can fetch an image URL
 * itself, but that path is not dependable for a CMS: it requires the file to be
 * reachable from the public internet — never true in local development, and not
 * true for private buckets. Sending the bytes removes that whole class of
 * failure for the price of one extra download, and supplies the `media_type`
 * that a base64 image block requires and a URL cannot carry.
 *
 * @example
 * ```typescript
 * import { anthropicResolver } from '@jhb.software/payload-alt-text-plugin'
 *
 * anthropicResolver({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: 'claude-opus-5', // optional, this is the default
 * })
 * ```
 */
export const anthropicResolver = ({
  apiKey,
  baseUrl = 'https://api.anthropic.com',
  effort,
  instructions,
  model = 'claude-opus-5',
  timeoutMs = 30_000,
}: AnthropicResolverConfig): AltTextResolver =>
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

      const response = await fetch(`${baseUrl}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: maxTokens,
          messages: [
            {
              content: [
                // Claude works best when the image comes before the text.
                {
                  type: 'image',
                  source: { type: 'base64', data: image.base64, media_type: image.mediaType },
                },
                ...(filename ? [{ type: 'text', text: filename }] : []),
              ],
              role: 'user',
            },
          ],
          model,
          // `format` constrains the response to the schema the plugin needs;
          // `effort` caps how long Claude thinks before producing it. Only sent
          // when configured: some models reject the field outright.
          output_config: {
            ...(effort ? { effort } : {}),
            format: { type: 'json_schema', schema: responseSchema },
          },
          // The instructions are an operator instruction, not a turn in the
          // conversation, so they travel as the top-level system prompt.
          system: resolvedInstructions,
        }),
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        method: 'POST',
        signal,
      })

      if (!response.ok) {
        // Bounded: unbounded provider text would land in the log as-is.
        const body = (await response.text().catch(() => '')).slice(0, 500)

        throw new VisionProviderError({ body, label: 'Anthropic', status: response.status })
      }

      const message = (await response.json()) as AnthropicMessage

      // A refusal and a truncated answer both arrive as a 200 with unusable
      // content, so they are named rather than surfacing as a JSON parse error.
      if (message.stop_reason === 'refusal') {
        throw new Error('Claude declined to describe this image')
      }

      if (message.stop_reason === 'max_tokens') {
        throw new Error(
          `Claude ran out of tokens before finishing the alt text (max_tokens: ${maxTokens})`,
        )
      }

      const text = message.content?.find((block) => block.type === 'text')?.text

      if (typeof text !== 'string') {
        throw new Error('No result from Anthropic')
      }

      try {
        return JSON.parse(text)
      } catch {
        throw new Error('Claude returned a response that was not valid JSON')
      }
    },
    inlineImage: true,
    instructions,
    key: 'anthropic',
    label: 'Anthropic',
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTokensPerLocale: MAX_TOKENS_PER_LOCALE,
    supportedMimeTypes: SUPPORTED_MIME_TYPES,
    timeoutMs,
  })
