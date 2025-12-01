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
  model?: string
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
      imageThumbnailUrl,
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
                  image_url: { url: imageThumbnailUrl },
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

        const result = response.choices[0]?.message?.parsed

        if (!result) {
          return { error: 'No result from OpenAI', success: false }
        }

        return {
          result,
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
      imageThumbnailUrl,
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
                keywords: z
                  .array(z.string())
                  .describe('Keywords that describe the content of the image'),
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

      Format your response as a JSON object with ${locales.join(', ')} keys, each containing "altText" and "keywords".
    `,
              role: 'system',
            },
            {
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageThumbnailUrl },
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

        const result = response.choices[0]?.message?.parsed

        if (!result) {
          return { error: 'No result from OpenAI', success: false }
        }

        return {
          results: result,
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
