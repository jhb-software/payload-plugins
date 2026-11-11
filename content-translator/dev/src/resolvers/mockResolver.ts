import type { TranslateResolver } from '@jhb.software/payload-content-translator-plugin'

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

/**
 * Strips the segment markers of every rich text value, as a careless model would, to
 * demonstrate the retry and the warning for text left in the source language. Select
 * it with `TRANSLATOR_RESOLVER=damaged-markers`.
 */
export const damagedMarkersResolver = (): TranslateResolver => ({
  key: 'damaged-markers',
  resolve: ({ localeTo, texts }) => ({
    success: true,
    translatedTexts: texts.map((text) =>
      /⟦/.test(text) ? text.replaceAll(/⟦[^⟧]*⟧/g, '') : `${text} [Translated to ${localeTo}]`,
    ),
  }),
})
