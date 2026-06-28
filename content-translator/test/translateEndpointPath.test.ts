import type { Config } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { TranslateResolver } from '../src/resolvers/types.ts'

import { PLUGIN_SLUG } from '../src/constants.ts'
import { payloadContentTranslatorPlugin } from '../src/plugin.ts'

const resolver = { key: 'test-resolver', resolve: async () => [] } as unknown as TranslateResolver

const baseConfig = {
  localization: { defaultLocale: 'en', locales: ['en', 'de'] },
} as unknown as Config

describe('translate endpoint registration', () => {
  test('serves the translate endpoint under the plugin slug prefix', () => {
    const plugin = payloadContentTranslatorPlugin({ collections: [], globals: [], resolver })

    const result = plugin(baseConfig)

    const endpoint = result.endpoints?.find((e) => e.method === 'post')
    assert.ok(endpoint, 'expected the plugin to register a POST translate endpoint')
    assert.equal(endpoint?.path, `/${PLUGIN_SLUG}/translate`)
    assert.equal(endpoint?.path, '/content-translator/translate')
  })
})
