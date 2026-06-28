import type { Config } from 'payload'

import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'

import type { IncomingAltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { PLUGIN_SLUG } from '../src/constants.ts'
import { payloadAltTextPlugin } from '../src/plugin.ts'

const baseConfig = {
  collections: [{ slug: 'media', fields: [], upload: true }],
} as unknown as Config

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

describe('alt text endpoint paths', () => {
  test('registers generate, bulk, and health endpoints under the plugin slug prefix', () => {
    const config = payloadAltTextPlugin(pluginConfig)(baseConfig)
    const paths = config.endpoints?.map((e) => e.path) ?? []

    assert.ok(paths.includes(`/${PLUGIN_SLUG}/generate`))
    assert.ok(paths.includes(`/${PLUGIN_SLUG}/generate/bulk`))
    assert.ok(paths.includes(`/${PLUGIN_SLUG}/health`))

    // Pin the concrete prefix so the slug rename is not silently reverted.
    expect(paths).toEqual(
      expect.arrayContaining(['/alt-text/generate', '/alt-text/generate/bulk', '/alt-text/health']),
    )
    assert.ok(!paths.some((p) => p?.startsWith('/alt-text-plugin/')))
  })
})
