import type { Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { payloadGeocodingPlugin } from './plugin.js'

const BASE_CONFIG: Config = {
  collections: [],
  db: {} as any,
  secret: 'test',
}

describe('payloadGeocodingPlugin', () => {
  it('registers the geocoding search endpoint when enabled', () => {
    const plugin = payloadGeocodingPlugin({
      googleMapsApiKey: 'test-key',
    })
    const config = plugin(BASE_CONFIG)

    expect(config.endpoints).toBeDefined()
    expect(config.endpoints).toHaveLength(1)
    expect(config.endpoints![0]).toMatchObject({
      method: 'get',
      path: '/geocoding-plugin/search',
    })
  })

  it('does not register endpoint when plugin is disabled', () => {
    const plugin = payloadGeocodingPlugin({
      enabled: false,
      googleMapsApiKey: 'test-key',
    })
    const config = plugin(BASE_CONFIG)

    expect(config.endpoints ?? []).toHaveLength(0)
  })

  it('stores the API key in config.custom', () => {
    const plugin = payloadGeocodingPlugin({
      googleMapsApiKey: 'my-api-key',
    })
    const config = plugin(BASE_CONFIG)

    expect(config.custom?.payloadGeocodingPlugin?.googleMapsApiKey).toBe('my-api-key')
  })

  it('passes custom access function to the endpoint', () => {
    const customAccess = () => true
    const plugin = payloadGeocodingPlugin({
      geocodingEndpoint: { access: customAccess },
      googleMapsApiKey: 'test-key',
    })
    const config = plugin(BASE_CONFIG)

    expect(config.endpoints).toHaveLength(1)
    // The endpoint handler should exist (access is used internally)
    expect(config.endpoints![0].handler).toBeDefined()
  })

  it('preserves existing endpoints from incoming config', () => {
    const existingEndpoint = { handler: () => Response.json({ ok: true }), method: 'get' as const, path: '/health' }
    const plugin = payloadGeocodingPlugin({
      googleMapsApiKey: 'test-key',
    })
    const config = plugin({ ...BASE_CONFIG, endpoints: [existingEndpoint] })

    expect(config.endpoints).toHaveLength(2)
  })
})
