import type { GeneratedTranslations, TranslateInstructions } from './createPromptResolver.js'
import type { TranslateResolver } from './types.js'

import { createPromptResolver } from './createPromptResolver.js'

export type OpenAIResolverConfig = {
  apiKey: string
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

type OpenAIResponse = {
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

export const openAIResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  instructions: instructionsOption,
  model = 'gpt-4o-mini',
}: OpenAIResolverConfig): TranslateResolver =>
  createPromptResolver({
    chunkLength,
    generate: async ({ input, instructions, req }): Promise<GeneratedTranslations> => {
      const response = await fetch(`${baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
        body: JSON.stringify({
          messages: [
            { content: instructions, role: 'system' },
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

      const data: OpenAIResponse = await response.json()

      if (!response.ok) {
        req.payload.logger.info({
          message: 'An error occurred when trying to translate the data using OpenAI API',
          openAIresponse: data,
        })

        throw new Error(`OpenAI API responded with status ${response.status}`)
      }

      const content = data?.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('Missing content in the OpenAI API response')
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

        throw new Error('The OpenAI API response is not valid JSON')
      }

      if (!parsedResponse || typeof parsedResponse !== 'object') {
        req.payload.logger.error({
          fullContent: content,
          message: 'An error occurred when trying to parse the content - response is not an object',
        })

        throw new Error('The OpenAI API response is not an object')
      }

      if (!('translations' in parsedResponse)) {
        req.payload.logger.error({
          fullContent: content,
          message:
            'An error occurred when trying to parse the content - missing "translations" key',
          parsedResponse,
        })

        throw new Error('The OpenAI API response is missing the "translations" key')
      }

      return parsedResponse.translations as GeneratedTranslations
    },
    instructions: instructionsOption,
    key: 'openai',
    responseFormatInstruction,
  })
