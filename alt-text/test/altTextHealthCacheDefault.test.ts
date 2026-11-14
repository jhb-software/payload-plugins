import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

import { setupHealthCacheInstance } from './support/healthCacheHarness.ts'

/**
 * The counterpart of `altTextHealthCacheDisabled.test.ts`: by default the report
 * is cached, so a write another instance handled stays invisible here.
 */

vi.mock(
  'next/cache.js',
  async () => (await import('./support/nextDataCacheFake.ts')).nextDataCacheFake,
)
vi.mock('next/server.js', () => ({ after: (callback: () => void): void => callback() }))

test('by default, the report is served from the cache until this instance revalidates it', async () => {
  const { fillOnAnotherInstance, missingDocs, payload } = await setupHealthCacheInstance({})

  assert.equal(await missingDocs(), 1)
  await fillOnAnotherInstance()

  assert.equal(await missingDocs(), 1)
  await payload.destroy()
})
