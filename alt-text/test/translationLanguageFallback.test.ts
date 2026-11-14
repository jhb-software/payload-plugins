import type { Config } from 'payload'

import assert from 'node:assert/strict'

import { initI18n } from '@payloadcms/translations'
import { en } from '@payloadcms/translations/languages/en'
import { fr } from '@payloadcms/translations/languages/fr'
import { ru } from '@payloadcms/translations/languages/ru'
import { describe, test } from 'vitest'

import type { IncomingAltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { payloadAltTextPlugin } from '../src/plugin.ts'

// The plugin ships English and German strings only. Payload resolves a key against the
// active admin language alone, so for any other language the plugin namespace used to be
// absent and Payload's plural lookup threw
// "Cannot use 'in' operator to search for 'totalImageCount_two' in undefined" (issue #220).

const pluginConfig: IncomingAltTextPluginConfig = {
  collections: ['media'],
  getImageThumbnail: () => 'https://example.com/thumb.png',
  locale: 'en',
  resolver: {
    key: 'mock',
    resolve: async () => ({ success: true, result: { altText: 'a', keywords: [] } }),
    resolveBulk: async () => ({ success: true, results: {} }),
  },
}

const configWithI18n = (i18n?: unknown) =>
  payloadAltTextPlugin(pluginConfig)({
    collections: [{ slug: 'media', fields: [], upload: true }],
    i18n,
  } as unknown as Config)

/** Runs Payload's own i18n initialization and returns a `t` accepting plugin keys. */
const translate = async (
  i18nConfig: unknown,
  { context, language }: { context: 'api' | 'client'; language: string },
) => {
  const i18n = await initI18n({
    config: i18nConfig as never,
    context,
    language: language as never,
  })

  return i18n.t as unknown as (key: string, vars?: Record<string, unknown>) => string
}

describe('admin languages without bundled plugin strings', () => {
  test('a counted key falls back to English instead of throwing', async () => {
    const config = configWithI18n({ fallbackLanguage: 'ru', supportedLanguages: { en, ru } })

    const t = await translate(config.i18n, { context: 'client', language: 'ru' })

    assert.equal(
      t('@jhb.software/payload-alt-text-plugin:totalImageCount', { count: 2 }),
      '2 images',
    )
  })

  test('a language Payload accepts but the config does not list is covered too', async () => {
    const config = configWithI18n()

    const t = await translate(
      { ...config.i18n, supportedLanguages: { fr } },
      { context: 'api', language: 'fr' },
    )

    assert.equal(
      t('@jhb.software/payload-alt-text-plugin:totalImageCount', { count: 2 }),
      '2 images',
    )
  })

  test('user-provided strings for such a language still win over the fallback', async () => {
    const config = configWithI18n({
      supportedLanguages: { en, ru },
      translations: {
        ru: {
          '@jhb.software/payload-alt-text-plugin': {
            totalImageCount_few: '{{count}} изображения',
          },
        },
      },
    })

    const t = await translate(config.i18n, { context: 'api', language: 'ru' })

    assert.equal(
      t('@jhb.software/payload-alt-text-plugin:totalImageCount', { count: 3 }),
      '3 изображения',
    )
  })
})
