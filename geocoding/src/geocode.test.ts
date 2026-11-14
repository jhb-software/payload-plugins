import type { Config, PayloadRequest } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { geocode } from './geocode.js'
import { payloadGeocodingPlugin } from './plugin.js'

function requestFor(options: Parameters<typeof payloadGeocodingPlugin>[0]): PayloadRequest {
  const config = payloadGeocodingPlugin(options)({} as Config)
  return { context: {}, payload: { config } } as unknown as PayloadRequest
}

describe('geocode', () => {
  test('never sends the browser key to Google when no server key is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const outcome = await geocode({
      address: 'Berlin',
      req: requestFor({ googleMapsApiKey: 'browser-key' }),
    })

    expect(outcome).toMatchObject({ ok: false, reason: 'not_configured' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('answers unavailable instead of throwing when a custom geocoder throws', async () => {
    const outcome = await geocode({
      address: 'Berlin',
      req: requestFor({
        geocoder: () => {
          throw new Error('boom')
        },
      }),
    })

    expect(outcome).toMatchObject({ ok: false, reason: 'unavailable' })
  })
})
