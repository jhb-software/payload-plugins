import type { TranslateResolver } from '@jhb.software/payload-content-translator'

/**
 * A mock resolver for testing purposes.
 * Appends "[Translated to {locale}]" to each text.
 */
export const mockResolver = (): TranslateResolver => ({
  key: 'mock',
  resolve: ({ localeTo, texts }) => {
    return {
      success: true,
      translatedTexts: texts.map((text) => `${text} [Translated to ${localeTo}]`),
    }
  },
})
