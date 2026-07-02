import type { Config } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { IncomingAltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

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

describe('alt text REST endpoints', () => {
  test('are served under the /api/alt-text prefix', () => {
    const config = payloadAltTextPlugin(pluginConfig)(baseConfig)
    const paths = (config.endpoints?.map((e) => e.path) ?? []).sort()

    assert.deepEqual(paths, ['/alt-text/generate', '/alt-text/generate/bulk', '/alt-text/health'])
  })
})
