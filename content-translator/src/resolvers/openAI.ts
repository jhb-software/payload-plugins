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
  // Send each text under an explicit string key (its index) instead of as a bare
  // array. The model is asked to return the SAME keys, so each translation maps
  // back to its source by key rather than by array position. This prevents a
  // dropped or merged item from shifting every later translation onto the wrong
  // field — a missing key just leaves that one fragment untranslated.
  const keyedTexts = Object.fromEntries(texts.map((text, index) => [String(index), text]))

  return `Translate the values of the following JSON object from the language with ISO 639 code "${localeFrom}" to the language with ISO 639 code "${localeTo}".

IMPORTANT: You must return ONLY a valid JSON object with a "translations" key whose value is an object with EXACTLY the same keys as the input object below. Return one translated value per key. Do not add, remove, merge, split, or reorder keys, and translate each value on its own even if two adjacent values read as a single phrase. Properly escape all special characters including quotes, newlines, and backslashes according to JSON standards.

Input object to translate:
${JSON.stringify(keyedTexts, null, 2)}

Expected response format:
{
  "translations": { "0": "translated value 0", "1": "translated value 1", ... }
}`
}

/**
 * Reconstructs the translated texts for a chunk strictly from the source indices
 * so the result always has the same length and order as the input. A keyed
 * object response is mapped by index key; a legacy array response is mapped by
 * position. In both cases a missing or non-string entry falls back to the
 * untranslated source, isolating a single dropped fragment instead of shifting
 * the rest. Returns null when the shape is neither an array nor an object.
 */
const mapChunkTranslations = (sources: string[], translations: unknown): null | string[] => {
  if (Array.isArray(translations)) {
    return sources.map((source, index) =>
      typeof translations[index] === 'string' ? translations[index] : source,
    )
  }

  if (translations && typeof translations === 'object') {
    const byKey = translations as Record<string, unknown>

    return sources.map((source, index) => {
      const value = byKey[String(index)]
      return typeof value === 'string' ? value : source
    })
  }

  return null
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
        const chunkResults = await Promise.all(
          chunkArray(texts, chunkLength).map(async (chunkTexts) => {
            const res = await fetch(apiUrl, {
              body: JSON.stringify({
                messages: [
                  {
                    content: prompt({ localeFrom, localeTo, texts: chunkTexts }),
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
            })

            const data: OpenAIResponse = await res.json()

            if (!res.ok) {
              req.payload.logger.info({
                message: 'An error occurred when trying to translate the data using OpenAI API',
                openAIresponse: data,
              })

              return { success: false as const }
            }

            const content = data?.choices?.[0]?.message?.content

            if (!content) {
              req.payload.logger.error(
                'An error occurred when trying to translate the data using OpenAI API - missing content in the response',
              )

              return { success: false as const }
            }

            let translations: unknown

            try {
              const parsedResponse = JSON.parse(content)

              if (!parsedResponse || typeof parsedResponse !== 'object') {
                req.payload.logger.error({
                  fullContent: content,
                  message:
                    'An error occurred when trying to parse the content - response is not an object',
                })

                return { success: false as const }
              }

              if (!parsedResponse.translations) {
                req.payload.logger.error({
                  fullContent: content,
                  message:
                    'An error occurred when trying to parse the content - missing "translations" key',
                  parsedResponse,
                })

                return { success: false as const }
              }

              translations = parsedResponse.translations
            } catch (e) {
              req.payload.logger.error({
                error: e instanceof Error ? e.message : String(e),
                fullContent: content,
                message: 'An error occurred when trying to parse the content - JSON parsing failed',
              })

              return { success: false as const }
            }

            // Reconstruct strictly from the source indices so the chunk result
            // always lines up with its input, regardless of dropped/merged keys.
            const translatedChunk = mapChunkTranslations(chunkTexts, translations)

            if (!translatedChunk) {
              req.payload.logger.error({
                data: translations,
                fullContent: content,
                message:
                  'An error occurred when trying to translate the data using OpenAI API - "translations" is neither an array nor an object',
              })

              return { success: false as const }
            }

            return { success: true as const, translatedTexts: translatedChunk }
          }),
        )

        const translated: string[] = []

        for (const result of chunkResults) {
          if (!result.success) {
            return { success: false as const }
          }

          translated.push(...result.translatedTexts)
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
