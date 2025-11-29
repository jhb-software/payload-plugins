import type { AutoParseableResponseFormat } from 'openai/lib/parser.mjs'
import type { ChatCompletionContentPartText } from 'openai/resources/chat/completions.mjs'
import type { ResponseFormatJSONSchema } from 'openai/resources/shared.mjs'

import OpenAI from 'openai'
import { makeParseableResponseFormat } from 'openai/lib/parser.mjs'
import { z } from 'zod'

import type {
  AltTextBulkResolverArgs,
  AltTextBulkResolverResponse,
  AltTextResolver,
  AltTextResolverArgs,
  AltTextResolverResponse,
} from './types.js'

export type OpenAIResolverConfig = {
  /** OpenAI API key for authentication */
  apiKey: string
  /**
   * The OpenAI LLM model to use for alt text generation.
   * @default 'gpt-4.1-nano'
   */
  model?: 'gpt-4.1-mini' | 'gpt-4.1-nano'
}

type GenerationCost = {
  inputCost: number
  model: 'gpt-4.1-mini' | 'gpt-4.1-nano'
  outputCost: number
  totalCost: number
  totalTokens: number
}

/** Calculates the cost of a generation. */
function getGenerationCost(
  response: OpenAI.Chat.Completions.ChatCompletion,
  model: 'gpt-4.1-mini' | 'gpt-4.1-nano',
): GenerationCost {
  const modelCosts: Record<'gpt-4.1-mini' | 'gpt-4.1-nano', { input: number; output: number }> = {
    // see https://platform.openai.com/docs/models/gpt-4.1-nano
    'gpt-4.1-nano': {
      input: 0.1,
      output: 0.4,
    },
    // see https://platform.openai.com/docs/models/gpt-4.1-mini
    'gpt-4.1-mini': {
      input: 0.4,
      output: 1.6,
    },
  }

  // Calculate cost based on token usage
  const inputTokens = response.usage?.prompt_tokens || 0
  const outputTokens = response.usage?.completion_tokens || 0
  const totalTokens = response.usage?.total_tokens || 0

  const inputCost = (inputTokens / 1_000_000) * modelCosts[model].input
  const outputCost = (outputTokens / 1_000_000) * modelCosts[model].output
  const totalCost = inputCost + outputCost

  return {
    inputCost,
    model,
    outputCost,
    totalCost,
    totalTokens,
  }
}

/**
 * Creates a chat completion `JSONSchema` response format object from
 * the given Zod schema.
 *
 * This is a temporary drop in replacement for the zodResponseFormat from openai/helpers/zod.ts
 * because of issue https://github.com/openai/openai-node/issues/1576
 */
function zodResponseFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
  name: string,
  props?: Omit<ResponseFormatJSONSchema.JSONSchema, 'name' | 'schema' | 'strict'>,
): AutoParseableResponseFormat<z.infer<ZodInput>> {
  return makeParseableResponseFormat(
    {
      type: 'json_schema',
      json_schema: {
        ...props,
        name,
        schema: z.toJSONSchema(zodObject, { target: 'draft-7' }),
        strict: true,
      },
    },
    (content) => zodObject.parse(JSON.parse(content)),
  )
}

/**
 * Creates an OpenAI-based resolver for alt text generation.
 *
 * @example
 * ```typescript
 * import { openAIResolver } from '@jhb.software/payload-alt-text-plugin'
 *
 * openAIResolver({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4.1-mini', // optional, defaults to 'gpt-4.1-nano'
 * })
 * ```
 */
export const openAIResolver = (config: OpenAIResolverConfig): AltTextResolver => {
  const { apiKey, model = 'gpt-4.1-nano' } = config

  return {
    key: 'openai',

    resolve: async ({
      filename,
      imageUrl,
      locale,
    }: AltTextResolverArgs): Promise<AltTextResolverResponse> => {
      try {
        const openai = new OpenAI({ apiKey })

        const modelResponseSchema = z.object({
          altText: z.string().describe('A concise, descriptive alt text for the image'),
          keywords: z.array(z.string()).describe('Keywords that describe the content of the image'),
        })

        const response = await openai.chat.completions.parse({
          max_completion_tokens: 150,
          messages: [
            {
              content: `
            You are an expert at analyzing images and creating descriptive image alt text.

            Please analyze the given image and provide the following:
            - A concise, descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.
            - A list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"

            If a context is provided, use it to enhance the alt text.

            Format your response as a JSON object. You must respond in the ${locale} language.
          `,
              role: 'system',
            },
            {
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
                ...(filename
                  ? [
                      {
                        type: 'text',
                        text: filename,
                      } satisfies ChatCompletionContentPartText,
                    ]
                  : []),
              ],
              role: 'user',
            },
          ],
          model,
          response_format: zodResponseFormat(modelResponseSchema, 'data'),
        })

        console.log({ imageUrl, ...getGenerationCost(response, model) })

        const result = response.choices[0]?.message?.parsed

        if (!result) {
          return { error: 'No result from OpenAI', success: false }
        }

        return {
          result: {
            altText: result.altText,
            keywords: result.keywords,
          },
          success: true,
        }
      } catch (error) {
        console.error('Error generating alt text:', error)
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false,
        }
      }
    },

    resolveBulk: async ({
      filename,
      imageUrl,
      locales,
    }: AltTextBulkResolverArgs): Promise<AltTextBulkResolverResponse> => {
      try {
        const openai = new OpenAI({ apiKey })

        const modelResponseSchema = z.object(
          Object.fromEntries(
            locales.map((locale) => [
              locale,
              z.object({
                altText: z.string().describe('A concise, descriptive alt text for the image'),
                keywords:
                  z.array(z.string()).describe('Keywords that describe the content of the image'),
              }),
            ]),
          ),
        )

        const response = await openai.chat.completions.parse({
          max_completion_tokens: 300,
          messages: [
            {
              content: `
      You are an expert at analyzing images and creating descriptive image alt text.

      Please analyze the given image and provide the following in ${locales.join(', ')}:
      - A concise, localized descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.
      - A localized list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"

      If a context is provided, use it to enhance the alt text.

      Format your response as a JSON object with ${locales.join(', ')} keys, each containing "altText", "keywords" and "slug".
    `,
              role: 'system',
            },
            {
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
                ...(filename
                  ? [
                      {
                        type: 'text',
                        text: filename,
                      } satisfies ChatCompletionContentPartText,
                    ]
                  : []),
              ],
              role: 'user',
            },
          ],
          model,
          response_format: zodResponseFormat(modelResponseSchema, 'data'),
        })

        console.log({ imageUrl, ...getGenerationCost(response, model) })

        const result = response.choices[0]?.message?.parsed

        if (!result) {
          return { error: 'No result from OpenAI', success: false }
        }

        const results: Record<string, { altText: string; keywords: string[] }> = {}
        for (const locale of locales) {
          const localeResult = (result as Record<string, { altText: string; keywords: string[] }>)[
            locale
          ]
          if (localeResult) {
            results[locale] = {
              altText: localeResult.altText,
              keywords: localeResult.keywords,
            }
          }
        }

        return {
          results,
          success: true,
        }
      } catch (error) {
        console.error('Error generating bulk alt text:', error)
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false,
        }
      }
    },
  }
}
