import type { TranslateResolver } from '@jhb.software/payload-content-translator-plugin'

/**
 * A resolver that drops one string from its result, mimicking a model that
 * merges two adjacent fragments into one (as GPT-4o-mini does with long
 * rich-text documents).
 *
 * Wire this in instead of the real resolver to verify the translate operation
 * now refuses to apply a misaligned result and surfaces an error, rather than
 * silently shifting every later field onto its neighbour's text.
 */
export const droppingResolver = (): TranslateResolver => ({
  key: 'dropping',
  resolve: ({ localeTo, texts }) => ({
    success: true,
    // Drop the first text so the result is one shorter than the input.
    translatedTexts: texts.slice(1).map((text) => `${text} [Translated to ${localeTo}]`),
  }),
})
