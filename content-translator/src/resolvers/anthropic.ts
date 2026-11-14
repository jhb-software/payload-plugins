import type { GeneratedTranslations, TranslateInstructions } from './createPromptResolver.js'
import type { TranslateResolver } from './types.js'

import { createPromptResolver } from './createPromptResolver.js'

export type AnthropicResolverConfig = {
  apiKey: string
  /**
   * Origin of the Anthropic API, without the `/v1/messages` path.
   * @default 'https://api.anthropic.com'
   */
  baseUrl?: string
  /**
   * How many texts to include into 1 request
   * @default 100
   */
  chunkLength?: number
  /**
   * Caps how long Claude thinks before answering. Lower effort still thinks on
   * a difficult passage, just less than a higher setting would.
   *
   * Translating is not a reasoning-heavy task, so `'low'` keeps the spend down
   * on the models that accept it. Omitted, the field is not sent and Claude
   * uses its default (`'high'`) — which also keeps models without effort
   * support, such as `claude-haiku-4-5`, usable.
   */
  effort?: 'high' | 'low' | 'max' | 'medium' | 'xhigh'
  /**
   * Builds the instructions from the default ones, e.g. to append protected
   * terms. Sent as the system prompt, separately from the texts.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: TranslateInstructions
  /**
   * Token budget for one chunk's translations, thinking tokens included.
   *
   * Derived from `chunkLength` by default so the two cannot drift apart: a
   * chunk that grows without its budget growing gets truncated, and because
   * every chunk is awaited together, one truncated chunk fails the whole
   * document. Raise it for long-form content.
   *
   * @default chunkLength * 250
   */
  maxTokens?: number
  /**
   * The Claude model to use.
   *
   * `claude-sonnet-5` is the cheaper choice for a large content base;
   * `claude-haiku-4-5` works too, but only without `effort`.
   *
   * @default 'claude-opus-5'
   */
  model?: string
  /**
   * Abort a chunk's request after this many milliseconds, so a stalled provider
   * cannot hold the admin translate request open indefinitely.
   *
   * @default 120000
   */
  timeoutMs?: number
}

type AnthropicMessage = {
  content?: { text?: string; type: string }[]
  stop_reason?: string
}

/**
 * Requires one string per input index, so a merged, dropped or reordered entry
 * is rejected by the provider rather than reconstructed into the wrong field.
 *
 * Structured output makes this a guarantee, which is why this resolver sends no
 * response format instruction of its own.
 */
const schemaForChunk = (texts: string[]) => {
  const keys = texts.map((_text, index) => String(index))

  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(keys.map((key) => [key, { type: 'string' }])),
    required: keys,
  }
}

/**
 * Creates a Claude-based translation resolver.
 *
 * @example
 * ```typescript
 * import { anthropicResolver } from '@jhb.software/payload-content-translator-plugin'
 *
 * anthropicResolver({
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 *   model: 'claude-opus-5', // optional, this is the default
 * })
 * ```
 */
export const anthropicResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  effort,
  instructions,
  maxTokens = chunkLength * 250,
  model = 'claude-opus-5',
  timeoutMs = 120_000,
}: AnthropicResolverConfig): TranslateResolver =>
  createPromptResolver({
    chunkLength,
    generate: async ({
      input,
      instructions: resolvedInstructions,
      req,
      texts,
    }): Promise<GeneratedTranslations> => {
      // Falsy rather than nullish, so a `process.env.X || ''` config reaches
      // the default host instead of a relative URL.
      const response = await fetch(`${baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: maxTokens,
          messages: [{ content: input, role: 'user' }],
          model,
          // `effort` is only sent when configured: some models reject the field.
          output_config: {
            ...(effort ? { effort } : {}),
            format: { type: 'json_schema', schema: schemaForChunk(texts) },
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
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        // Bounded: the body is provider text that ends up in a log entry.
        const body = (await response.text().catch(() => '')).slice(0, 500)

        req.payload.logger.info({
          message: 'An error occurred when trying to translate the data using the Anthropic API',
          response: body,
        })

        throw new Error(`Anthropic API responded with status ${response.status}`)
      }

      const message = (await response.json()) as AnthropicMessage

      // A refusal and a truncated answer both arrive as a 200 with unusable
      // content, so they are named rather than surfacing as a JSON parse error.
      if (message.stop_reason === 'refusal') {
        throw new Error('Claude declined to translate this content')
      }

      if (message.stop_reason === 'max_tokens') {
        throw new Error(
          `Claude ran out of tokens before finishing the chunk. Raise maxTokens (currently ${maxTokens}) or lower chunkLength (currently ${chunkLength}).`,
        )
      }

      const text = message.content?.find((block) => block.type === 'text')?.text

      if (!text) {
        throw new Error('Missing content in the Anthropic API response')
      }

      try {
        return JSON.parse(text) as GeneratedTranslations
      } catch (e) {
        req.payload.logger.error({
          error: e instanceof Error ? e.message : String(e),
          fullContent: text,
          message: 'An error occurred when trying to parse the content - JSON parsing failed',
        })

        throw new Error('The Anthropic API response is not valid JSON')
      }
    },
    instructions,
    key: 'anthropic',
    // No response format instruction: the schema above is enforced by the
    // provider, so the shape needs no restating in the prompt.
  })
