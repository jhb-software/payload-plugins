import type { Config } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { TranslateResolver } from '../src/resolvers/types.ts'

import { payloadContentTranslatorPlugin } from '../src/plugin.ts'

const resolver = { key: 'test-resolver', resolve: async () => [] } as unknown as TranslateResolver

const baseConfig = {
  localization: { defaultLocale: 'en', locales: ['en', 'de'] },
} as unknown as Config

describe('translate endpoint', () => {
  test('is served at /api/content-translator/translate', () => {
    const result = payloadContentTranslatorPlugin({ collections: [], globals: [], resolver })(
      baseConfig,
    )

    const endpoint = result.endpoints?.find((e) => e.method === 'post')
    assert.equal(endpoint?.path, '/content-translator/translate')
  })
})
