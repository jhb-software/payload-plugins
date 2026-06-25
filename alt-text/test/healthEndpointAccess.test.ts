import assert from 'node:assert/strict'

import type { Config, PayloadRequest } from 'payload'

import { describe, test } from 'vitest'

import type { IncomingAltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { payloadAltTextPlugin } from '../src/plugin.ts'
import { canViewHealthReport } from '../src/utilities/altTextHealth.ts'

/**
 * The health report exposes a collection-wide overview, so operators must be
 * able to gate it independently of the per-document generate access. The
 * function form of `healthCheck` guards both the health endpoint and the
 * dashboard widget; the boolean form falls back to the shared `access`.
 */

const baseConfig = {
  collections: [{ slug: 'media', fields: [], upload: true }],
} as unknown as Config

function buildPluginConfig(
  overrides: Partial<IncomingAltTextPluginConfig>,
): IncomingAltTextPluginConfig {
  return {
    collections: ['media'],
    getImageThumbnail: () => 'https://example.com/thumb.png',
    locale: 'en',
    resolver: {
      key: 'mock',
      resolve: async () => ({ success: true, result: { altText: 'a', keywords: [] } }),
      resolveBulk: async () => ({ success: true, results: {} }),
    },
    ...overrides,
  }
}

function healthHandler(incoming: IncomingAltTextPluginConfig) {
  const config = payloadAltTextPlugin(incoming)(baseConfig)
  const endpoint = config.endpoints?.find((e) => e.path === '/alt-text-plugin/health')
  assert.ok(endpoint, 'health endpoint should be registered')
  return endpoint.handler
}

const req = { user: { id: 'user-1' } } as unknown as PayloadRequest

describe('health endpoint access gate', () => {
  test('is guarded by the healthCheck function, not the generate access', async () => {
    let generateAccessCalled = false
    let healthAccessCalled = false

    const handler = healthHandler(
      buildPluginConfig({
        access: () => {
          generateAccessCalled = true
          return true
        },
        healthCheck: () => {
          healthAccessCalled = true
          return false
        },
      }),
    )

    const response = await handler(req)

    assert.equal(response.status, 401)
    assert.equal(healthAccessCalled, true)
    assert.equal(generateAccessCalled, false)
  })

  test('falls back to the generate access when healthCheck is true', async () => {
    let accessCalled = false

    const handler = healthHandler(
      buildPluginConfig({
        access: () => {
          accessCalled = true
          return false
        },
        healthCheck: true,
      }),
    )

    const response = await handler(req)

    assert.equal(response.status, 401)
    assert.equal(accessCalled, true)
  })
})

describe('health widget visibility', () => {
  function reqWithResolvedConfig(incoming: IncomingAltTextPluginConfig): PayloadRequest {
    const config = payloadAltTextPlugin(incoming)(baseConfig)
    return {
      payload: { config: { custom: config.custom } },
      user: { id: 'user-1' },
    } as unknown as PayloadRequest
  }

  test('is hidden when the healthCheck function denies the user', async () => {
    const visible = await canViewHealthReport(
      reqWithResolvedConfig(buildPluginConfig({ healthCheck: () => false })),
    )

    assert.equal(visible, false)
  })

  test('is shown when the healthCheck function allows the user', async () => {
    const visible = await canViewHealthReport(
      reqWithResolvedConfig(buildPluginConfig({ healthCheck: () => true })),
    )

    assert.equal(visible, true)
  })

  test('falls back to the generate access when healthCheck is the default', async () => {
    const visible = await canViewHealthReport(
      reqWithResolvedConfig(buildPluginConfig({ access: () => false })),
    )

    assert.equal(visible, false)
  })
})
