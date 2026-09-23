import type { Config } from 'payload'

import { initI18n } from '@payloadcms/translations'
import { ru } from '@payloadcms/translations/languages/ru'
import { describe, expect, test } from 'vitest'

import { payloadPagesPlugin } from '../src/plugin.js'

// The plugin ships English and German strings only. Payload resolves a key against the
// active admin language alone, so without a fallback every other language rendered the raw
// key ("@jhb.software/payload-pages-plugin:breadcrumbs") in the admin UI.

describe('admin languages without bundled plugin strings', () => {
  test('resolves a plugin key to the English string instead of the raw key', async () => {
    const config = payloadPagesPlugin({ generatePageURL: () => null })({
      collections: [],
      i18n: { supportedLanguages: { ru } },
    } as unknown as Config)

    const i18n = await initI18n({
      config: config.i18n as never,
      context: 'client',
      language: 'ru' as never,
    })

    expect(i18n.t('@jhb.software/payload-pages-plugin:breadcrumbs' as never)).toBe('Breadcrumbs')
  })
})
