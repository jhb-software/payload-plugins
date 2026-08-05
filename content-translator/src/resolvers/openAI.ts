import type { TranslateResolver } from './types.js'

import { chunkArray } from '../utils/chunkArray.js'

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
  const indexed: Record<string, string> = {}
  texts.forEach((text, i) => {
    indexed[String(i)] = text
  })

  return `Translate the values of the following JSON object from the language with ISO 639 code "${localeFrom}" to the language with ISO 639 code "${localeTo}".

IMPORTANT: Return ONLY a valid JSON object with a "translations" key whose value is an object using the EXACT SAME KEYS as the input. Translate each value independently and keep it under its own key. Never merge, split, drop, reorder, or add entries — even if two adjacent values look like fragments of the same sentence, they MUST stay as separate keys. Preserve leading and trailing whitespace of each value. Properly escape all special characters including quotes, newlines, and backslashes according to JSON standards.

Some values contain segment markers of the form ⟦0⟧, ⟦1⟧, ⟦2⟧ (a number enclosed in the brackets ⟦ ⟧). These markers separate inline formatting spans within one text. In your translation, keep every marker exactly as it appears — same characters, same numbers, each marker exactly once — and place each marker immediately before the translated words that belong to its segment. You may move words across markers when grammar requires it, but never add, remove, renumber, duplicate, or translate the markers themselves.

Input object to translate:
${JSON.stringify(indexed, null, 2)}

Expected response format:
{
  "translations": { "0": "translated value 0", "1": "translated value 1" }
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
      // ISO 639 language codes should always be lowercase
      localeFrom = localeFrom.toLowerCase()
      localeTo = localeTo.toLowerCase()
      const apiUrl = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`

      try {
        const response: {
          data: OpenAIResponse
          inputTexts: string[]
          success: boolean
        }[] = await Promise.all(
          chunkArray(texts, chunkLength).map(async (texts) => {
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
            }).then(async (res) => {
              const data = await res.json()

              if (!res.ok) {
                req.payload.logger.info({
                  message: 'An error occurred when trying to translate the data using OpenAI API',
                  openAIresponse: data,
                })
              }

              return {
                data,
                inputTexts: texts,
                success: res.ok,
              }
            })
          }),
        )

        const translated: string[] = []

        for (const { data, inputTexts, success } of response) {
          if (!success) {
            return {
              success: false as const,
            }
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

          let translationsObj: unknown

          try {
            const parsedResponse = JSON.parse(content)

            // Extract the translations from the response object
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

            translationsObj = parsedResponse.translations
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

          // "translations" must be an object (keyed by index) or an array.
          // A bare string would otherwise be indexed character by character
          // (e.g. "abc"["0"] === "a"), producing garbage that still looks
          // like a success - so reject anything that is not an object/array.
          if (translationsObj === null || typeof translationsObj !== 'object') {
            req.payload.logger.error({
              fullContent: content,
              message:
                'An error occurred when trying to parse the content - "translations" is not an object or array',
              translations: translationsObj,
            })

            return {
              success: false as const,
            }
          }

          // The model is asked to return an object keyed by the input index.
          // Reconstruct the output strictly from the input indices so the
          // result always has the same length and order as the input. A
          // missing / merged / non-string key keeps the original text (left
          // untranslated in its own slot) instead of shifting every later
          // value into the wrong field. An array response is tolerated too,
          // for backwards compatibility with custom prompts.
          for (let i = 0; i < inputTexts.length; i++) {
            const value = Array.isArray(translationsObj)
              ? translationsObj[i]
              : (translationsObj as Record<string, unknown>)[String(i)]

            if (typeof value === 'string') {
              translated.push(value)
            } else {
              req.payload.logger.warn({
                index: i,
                message:
                  'Translation missing or not a string for input index - keeping original text',
                original: inputTexts[i],
              })

              translated.push(inputTexts[i])
            }
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
