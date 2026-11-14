import type { GeneratedTranslations, TranslateInstructions } from './createPromptResolver.js'
import type { TranslateResolver } from './types.js'

import { createPromptResolver } from './createPromptResolver.js'

export type OpenAICompatibleResolverConfig = {
  apiKey: string
  /** Origin of the API, without the `/v1/chat/completions` path */
  baseUrl: string
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
  /** Identifies the resolver in the admin UI */
  key: string
  /** Provider name used in error messages */
  label: string
  model: string
}

type ChatCompletionResponse = {
  choices: {
    message: {
      content: string
    }
  }[]
}

/**
 * JSON mode guarantees valid JSON but not a particular shape, so the expected
 * shape is spelled out. It also requires the word "JSON" in the messages.
 */
const responseFormatInstruction = `Return ONLY a valid JSON object with a "translations" key whose value is an object using the same keys as the input. Properly escape all special characters including quotes, newlines, and backslashes according to JSON standards.

Expected response format:
{
  "translations": { "0": "translated value 0", "1": "translated value 1" }
}`

/**
 * Creates a resolver for any provider that serves OpenAI's
 * `/v1/chat/completions` endpoint with JSON mode.
 *
 * Provider-specific resolvers (`openAIResolver`, `mistralResolver`) are thin
 * wrappers that supply their own base URL, model default and label.
 */
export const createOpenAICompatibleResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  instructions,
  key,
  label,
  model,
}: OpenAICompatibleResolverConfig): TranslateResolver =>
  createPromptResolver({
    chunkLength,
    generate: async ({
      input,
      instructions: resolvedInstructions,
      req,
    }): Promise<GeneratedTranslations> => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        body: JSON.stringify({
          messages: [
            { content: resolvedInstructions, role: 'system' },
            { content: input, role: 'user' },
          ],
          model,
          response_format: { type: 'json_object' },
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'post',
      })

      const data: ChatCompletionResponse = await response.json()

      if (!response.ok) {
        req.payload.logger.info({
          message: `An error occurred when trying to translate the data using the ${label} API`,
          response: data,
        })

        throw new Error(`${label} API responded with status ${response.status}`)
      }

      const content = data?.choices?.[0]?.message?.content

      if (!content) {
        throw new Error(`Missing content in the ${label} API response`)
      }

      let parsedResponse: unknown

      try {
        parsedResponse = JSON.parse(content)
      } catch (e) {
        req.payload.logger.error({
          error: e instanceof Error ? e.message : String(e),
          fullContent: content,
          message: 'An error occurred when trying to parse the content - JSON parsing failed',
        })

        throw new Error(`The ${label} API response is not valid JSON`)
      }

      if (!parsedResponse || typeof parsedResponse !== 'object') {
        req.payload.logger.error({
          fullContent: content,
          message: 'An error occurred when trying to parse the content - response is not an object',
        })

        throw new Error(`The ${label} API response is not an object`)
      }

      if (!('translations' in parsedResponse)) {
        req.payload.logger.error({
          fullContent: content,
          message:
            'An error occurred when trying to parse the content - missing "translations" key',
          parsedResponse,
        })

        throw new Error(`The ${label} API response is missing the "translations" key`)
      }

      return parsedResponse.translations as GeneratedTranslations
    },
    instructions,
    key,
    responseFormatInstruction,
  })
