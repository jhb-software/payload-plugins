import type { SanitizedCollectionConfig } from 'payload'

import assert from 'node:assert/strict'

import { initI18n } from '@payloadcms/translations'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import { describe, test } from 'vitest'

import { getCollectionLabel } from '../src/utilities/getCollectionLabel.ts'

const i18nFor = (language: 'de' | 'en') =>
  initI18n({
    config: { fallbackLanguage: 'en', supportedLanguages: { de, en }, translations: {} } as never,
    context: 'client',
    language,
  })

const collections = [
  { slug: 'media', labels: { plural: { de: 'Medien', en: 'Media' } } },
  {
    slug: 'images',
    labels: { plural: ({ t }: { t: (key: string) => string }) => t('general:collections') },
  },
] as unknown as SanitizedCollectionConfig[]

describe('health widget collection labels', () => {
  test('follow the admin language, not the content locale', async () => {
    assert.equal(getCollectionLabel('media', collections, await i18nFor('de')), 'Medien')
    assert.equal(getCollectionLabel('media', collections, await i18nFor('en')), 'Media')
  })

  test('resolve function labels instead of falling back to the slug', async () => {
    assert.equal(getCollectionLabel('images', collections, await i18nFor('de')), 'Sammlungen')
  })
})
