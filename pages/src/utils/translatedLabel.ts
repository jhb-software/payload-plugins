import type { StaticLabel } from 'payload'

import { translations } from '../translations/index.js'

/** Returns the StaticLabel object for the given translation to to use inside the field label. */
export function translatedLabel(key: string): StaticLabel {
  return Object.fromEntries(
    Object.entries(translations).map(([locale, translation]) => [
      locale,
      (translation['@jhb.software/payload-pages-plugin'] as Record<string, string>)[key] || key,
    ]),
  )
}
