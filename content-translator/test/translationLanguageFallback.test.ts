import type { Config } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { initI18n } from '@payloadcms/translations'
import { ru } from '@payloadcms/translations/languages/ru'

import type { TranslatorConfig } from '../src/types.ts'

import { payloadContentTranslatorPlugin } from '../src/plugin.ts'

// The plugin ships English and German strings only. Payload resolves a key against the
// active admin language alone, so without a fallback every other language rendered the raw
// key ("plugin-translator:buttonLabel") in the admin UI.

const pluginConfig = {
  collections: [],
  globals: [],
  resolver: { key: 'mock', resolve: async () => [] },
} as unknown as TranslatorConfig

const configFor = (i18n: unknown) =>
  payloadContentTranslatorPlugin(pluginConfig)({
    collections: [],
    i18n,
    // The plugin only touches the config when localization is enabled.
    localization: { defaultLocale: 'en', locales: ['en', 'de'] },
  } as unknown as Config) as Config

describe('admin languages without bundled plugin strings', () => {
  test('resolves a plugin key to the English string instead of the raw key', async () => {
    const config = configFor({ supportedLanguages: { ru } })

    const i18n = await initI18n({
      config: config.i18n as never,
      context: 'client',
      language: 'ru' as never,
    })

    assert.equal(i18n.t('plugin-translator:buttonLabel' as never), 'Translate')
  })

  test('a project-supplied string wins over the plugin default', async () => {
    const config = configFor({
      supportedLanguages: { ru },
      translations: { ru: { 'plugin-translator': { buttonLabel: 'Перевести' } } },
    })

    const i18n = await initI18n({
      config: config.i18n as never,
      context: 'api',
      language: 'ru' as never,
    })

    assert.equal(i18n.t('plugin-translator:buttonLabel' as never), 'Перевести')
  })
})
