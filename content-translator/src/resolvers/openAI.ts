import { chunkArray } from '../utils/chunkArray'
import type { TranslateResolver } from './types'

export type OpenAIPrompt = (args: {
  localeFrom: string
  localeTo: string
  texts: string[]
}) => string

export type OpenAIResolverConfig = {
  apiKey: string
  baseUrl?: string
  /**
   * How many texts to include into 1 request
   * @default 100
   */
  chunkLength?: number
  /**
   * @default "gpt-4o-mini"
   */
  model?: string
  prompt?: OpenAIPrompt
}

type OpenAIResponse = {
  choices: {
    message: {
      content: string
    }
  }[]
}

const defaultPrompt: OpenAIPrompt = ({ localeFrom, localeTo, texts }) => {
  return `Translate the following array of strings from ${localeFrom.toUpperCase()} to ${localeTo.toUpperCase()}.

IMPORTANT: You must return ONLY a valid JSON object with a "translations" key containing the array of translated strings. The array must maintain the exact same length and order as the input. Properly escape all special characters including quotes, newlines, and backslashes according to JSON standards.

Input array to translate:
${JSON.stringify(texts, null, 2)}

Expected response format:
{
  "translations": ["translated string 1", "translated string 2", ...]
}`
}

export const openAIResolver = ({
  apiKey,
  baseUrl,
  chunkLength = 100,
  model = 'gpt-4o-mini',
  prompt = defaultPrompt,
}: OpenAIResolverConfig): TranslateResolver => {
  return {
    key: 'openai',
    resolve: async ({ localeFrom, localeTo, req, texts }) => {
      const apiUrl = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`

      try {
        const response: {
          data: OpenAIResponse
          success: boolean
        }[] = await Promise.all(
          chunkArray(texts, chunkLength).map(async texts => {
            return fetch(apiUrl, {
              body: JSON.stringify({
                messages: [
                  {
                    content: prompt({ localeFrom, localeTo, texts }),
                    role: 'user',
                  },
                ],
                model,
                response_format: { type: 'json_object' },
              }),
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              method: 'post',
            }).then(async res => {
              const data = await res.json()

              if (!res.ok)
                req.payload.logger.info({
                  message: 'An error occurred when trying to translate the data using OpenAI API',
                  openAIresponse: data,
                })

              return {
                data,
                success: res.ok,
              }
            })
          }),
        )

        const translated: string[] = []

        for (const { data, success } of response) {
          if (!success)
            return {
              success: false as const,
            }

          const content = data?.choices?.[0]?.message?.content

          if (!content) {
            req.payload.logger.error(
              'An error occurred when trying to translate the data using OpenAI API - missing content in the response',
            )

            return {
              success: false as const,
            }
          }

          let translatedChunk: string[] = []

          try {
            const parsedResponse = JSON.parse(content)

            // Extract translations array from the response object
            if (!parsedResponse || typeof parsedResponse !== 'object') {
              req.payload.logger.error({
                fullContent: content,
                message:
                  'An error occurred when trying to parse the content - response is not an object',
              })

              return {
                success: false as const,
              }
            }

            if (!parsedResponse.translations) {
              req.payload.logger.error({
                fullContent: content,
                message:
                  'An error occurred when trying to parse the content - missing "translations" key',
                parsedResponse,
              })

              return {
                success: false as const,
              }
            }

            translatedChunk = parsedResponse.translations
          } catch (e) {
            req.payload.logger.error({
              error: e instanceof Error ? e.message : String(e),
              fullContent: content,
              message: 'An error occurred when trying to parse the content - JSON parsing failed',
            })

            return {
              success: false as const,
            }
          }

          if (!Array.isArray(translatedChunk)) {
            req.payload.logger.error({
              data: translatedChunk,
              fullContent: content,
              message:
                'An error occurred when trying to translate the data using OpenAI API - parsed content is not an array',
            })

            return {
              success: false as const,
            }
          }

          for (const text of translatedChunk) {
            if (text && typeof text !== 'string') {
              req.payload.logger.error({
                chunkData: translatedChunk,
                data: text,
                fullContent: content,
                message:
                  'An error occurred when trying to translate the data using OpenAI API - parsed content is not a string',
              })

              return {
                success: false as const,
              }
            }

            translated.push(text)
          }
        }

        return {
          success: true as const,
          translatedTexts: translated,
        }
      } catch (e) {
        if (e instanceof Error) {
          req.payload.logger.info({
            message: 'An error occurred when trying to translate the data using OpenAI API',
            originalErr: e.message,
          })
        }

        return { success: false as const }
      }
    },
  }
}
