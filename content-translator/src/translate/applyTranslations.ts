import he from 'he'
import { APIError } from 'payload'

import type { ValueToTranslate } from './types.js'

/**
 * Applies the resolver's translated texts back onto the collected values.
 *
 * The mapping is positional, so a resolver that returns a different number of
 * texts than were requested would silently shift every later translation onto
 * the wrong field. Guard against that and fail loudly instead of writing
 * misaligned content. The OpenAI resolver already guarantees a length-preserving
 * result; this is defence-in-depth for that resolver and for custom ones.
 */
export const applyTranslations = (
  valuesToTranslate: ValueToTranslate[],
  translatedTexts: string[],
): void => {
  if (translatedTexts.length !== valuesToTranslate.length) {
    throw new APIError(
      `Translation resolver returned ${translatedTexts.length} texts for ${valuesToTranslate.length} source texts. Refusing to apply misaligned translations.`,
    )
  }

  translatedTexts.forEach((translated, index) => {
    valuesToTranslate[index].onTranslate(he.decode(translated))
  })
}
