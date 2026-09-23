import type { Config } from 'payload'

import { acceptedLanguages } from '@payloadcms/translations'

import { translations } from './translations.js'

type PluginTranslations = (typeof translations)['en']

/**
 * Payload resolves a key against the active admin language only, so for a language the plugin
 * ships no strings for the namespace is missing entirely and Payload's plural lookup throws
 * instead of falling back. Every language Payload accepts therefore gets the English strings.
 */
export const withLanguageFallbacks = (i18n: Config['i18n']): Record<string, PluginTranslations> => {
  const bundled = translations as Record<string, PluginTranslations>

  const languages = new Set<string>([
    ...acceptedLanguages,
    ...Object.keys(i18n?.supportedLanguages ?? {}),
    ...Object.keys(i18n?.translations ?? {}),
  ])

  return Object.fromEntries(
    Array.from(languages, (language) => [language, bundled[language] ?? translations.en]),
  )
}
