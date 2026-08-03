import type { PayloadRequest } from 'payload'

import type { TranslateResolver } from './types.js'

import { chunkArray } from '../utils/chunkArray.js'

export type TranslateInstructionsArgs = {
  /** The instructions the resolver would send on its own, stating the rules the plugin depends on */
  defaultInstructions: string
  /** Locale to translate from, as a lowercase ISO 639 code */
  localeFrom: string
  /** Locale to translate to, as a lowercase ISO 639 code */
  localeTo: string
}

export type TranslateInstructions = (args: TranslateInstructionsArgs) => Promise<string> | string

export type TranslateGenerateArgs = {
  /**
   * The texts of the current chunk as an index-keyed JSON object, e.g.
   * `{ "0": "one", "1": "two" }`. Send it as the user message.
   */
  input: string
  /** The instructions to send, e.g. as the system message */
  instructions: string
  /** Locale to translate from, as a lowercase ISO 639 code */
  localeFrom: string
  /** Locale to translate to, as a lowercase ISO 639 code */
  localeTo: string
  req: PayloadRequest
  /** The texts of the current chunk, in the order they appear in `input` */
  texts: string[]
}

/**
 * The translations of one chunk, keyed by the index of the input text, e.g.
 * `{ "0": "eins", "1": "zwei" }`. An array of translations is accepted too.
 */
export type GeneratedTranslations = Record<string, unknown> | unknown[]

export type PromptResolverConfig = {
  /**
   * How many texts to include into 1 request
   * @default 100
   */
  chunkLength?: number
  /**
   * Sends one chunk to the provider and returns its translations. Throwing
   * fails the translation, so provider errors need no special handling.
   */
  generate: (args: TranslateGenerateArgs) => GeneratedTranslations | Promise<GeneratedTranslations>
  /**
   * Builds the instructions from the default ones, e.g. to append protected
   * terms. Called once per translation. The texts are not part of the
   * instructions and cannot be altered here.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: TranslateInstructions
  /** Identifies the resolver in the admin UI */
  key: string
  /**
   * Provider-specific instructions on how to format the response. Appended
   * after any customization, so replacing the default instructions cannot
   * break the provider contract. Omit it when the provider already guarantees
   * the response shape, e.g. through structured output.
   */
  responseFormatInstruction?: string
}

/**
 * Rules dictated by the plugin rather than by the provider: values must stay
 * independent so each one can be written back to the field it came from, and
 * rich text is handed over with `⟦n⟧` segment markers carrying the inline
 * formatting.
 */
const buildDefaultInstructions = ({
  localeFrom,
  localeTo,
}: Omit<TranslateInstructionsArgs, 'defaultInstructions'>): string =>
  [
    `Translate the values of the JSON object provided by the user from the language with ISO 639 code "${localeFrom}" to the language with ISO 639 code "${localeTo}".`,

    `IMPORTANT: Use the EXACT SAME KEYS as the input. Translate each value independently and keep it under its own key. Never merge, split, drop, reorder, or add entries — even if two adjacent values look like fragments of the same sentence, they MUST stay as separate keys. Preserve leading and trailing whitespace of each value.`,

    `Some values contain segment markers of the form ⟦0⟧, ⟦1⟧, ⟦2⟧ (a number enclosed in the brackets ⟦ ⟧). These markers separate inline formatting spans within one text. In your translation, keep every marker exactly as it appears — same characters, same numbers, each marker exactly once — and place each marker immediately before the translated words that belong to its segment. You may move words across markers when grammar requires it, but never add, remove, renumber, duplicate, or translate the markers themselves.`,
  ].join('\n\n')

/**
 * Creates a resolver for a prompt-based (LLM) translation provider, leaving
 * only the provider call to `generate`: chunking, the instructions, the
 * serialized texts and the reconstruction of the response are handled here.
 *
 * The texts travel separately from the instructions, so customized
 * instructions can never alter or drop the content to translate.
 *
 * Providers that translate without a prompt (e.g. DeepL) implement
 * `TranslateResolver` directly instead.
 */
export const createPromptResolver = ({
  chunkLength = 100,
  generate,
  instructions = ({ defaultInstructions }) => defaultInstructions,
  key,
  responseFormatInstruction,
}: PromptResolverConfig): TranslateResolver => ({
  key,
  resolve: async ({ localeFrom, localeTo, req, texts }) => {
    // ISO 639 language codes should always be lowercase
    localeFrom = localeFrom.toLowerCase()
    localeTo = localeTo.toLowerCase()

    try {
      // The instructions do not depend on the texts, so every chunk is sent
      // the exact same ones.
      const customized = await instructions({
        defaultInstructions: buildDefaultInstructions({ localeFrom, localeTo }),
        localeFrom,
        localeTo,
      })

      // The response format is what the resolver and its provider agreed on,
      // not a rule about the content, so it is not customizable.
      const resolvedInstructions = [customized, responseFormatInstruction]
        .filter(Boolean)
        .join('\n\n')

      const chunks = await Promise.all(
        chunkArray(texts, chunkLength).map(async (chunkTexts) => {
          const indexed: Record<string, string> = {}
          chunkTexts.forEach((text, index) => {
            indexed[String(index)] = text
          })

          const translations = await generate({
            input: JSON.stringify(indexed, null, 2),
            instructions: resolvedInstructions,
            localeFrom,
            localeTo,
            req,
            texts: chunkTexts,
          })

          // A bare string would be indexed character by character
          // (e.g. "abc"["0"] === "a"), producing garbage that still looks like
          // a success - so reject anything that is not an object or array.
          if (translations === null || typeof translations !== 'object') {
            req.payload.logger.error({
              key,
              message: 'Translation aborted: the resolver returned no translations object',
              translations,
            })

            return null
          }

          // Rebuild strictly from the input indices, so that a merged, dropped
          // or reordered entry keeps its own slot instead of shifting every
          // later value into the wrong field.
          return chunkTexts.map((original, index) => {
            const translated = Array.isArray(translations)
              ? translations[index]
              : translations[String(index)]

            if (typeof translated !== 'string') {
              req.payload.logger.warn({
                index,
                key,
                message:
                  'Translation missing or not a string for input index - keeping original text',
                original,
              })

              return original
            }

            return translated
          })
        }),
      )

      if (chunks.includes(null)) {
        return { success: false as const }
      }

      return { success: true as const, translatedTexts: (chunks as string[][]).flat() }
    } catch (e) {
      req.payload.logger.error({
        key,
        message: 'An error occurred when trying to translate the data',
        originalErr: e instanceof Error ? e.message : String(e),
      })

      return { success: false as const }
    }
  },
})
