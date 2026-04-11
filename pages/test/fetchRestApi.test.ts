import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { fetchRestApi } from '../src/utils/fetchRestApi.ts'

describe('fetchRestApi', () => {
  const originalFetch = globalThis.fetch
  let recordedUrl: string | undefined

  beforeEach(() => {
    recordedUrl = undefined
    globalThis.fetch = ((input: RequestInfo | URL) => {
      recordedUrl = typeof input === 'string' ? input : input.toString()
      return Promise.resolve({
        json: () => Promise.resolve({ ok: true }),
        ok: true,
        statusText: 'OK',
      } as Response)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('uses the default /api route when no custom route is configured', async () => {
    await fetchRestApi('/pages/page-1', { depth: 0 }, { apiRoute: '/api', serverURL: '' })

    assert.ok(recordedUrl)
    assert.ok(
      recordedUrl.startsWith('/api/pages/page-1'),
      `expected URL to start with "/api/pages/page-1", got "${recordedUrl}"`,
    )
  })

  test('uses a configured custom API route', async () => {
    await fetchRestApi(
      '/pages/page-1',
      { depth: 0 },
      { apiRoute: '/custom-api', serverURL: 'https://cms.example.com' },
    )

    assert.ok(recordedUrl)
    assert.ok(
      recordedUrl.startsWith('https://cms.example.com/custom-api/pages/page-1'),
      `expected URL to start with "https://cms.example.com/custom-api/pages/page-1", got "${recordedUrl}"`,
    )
  })
})
