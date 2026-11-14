import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

import { setupHealthCacheInstance } from './support/healthCacheHarness.ts'

/**
 * `revalidateTag` only clears the cache of the instance that handled the write.
 * With several instances and no shared cache handler, the others serve stale
 * counts until the TTL ends — `healthCheck.cache: false` opts out of the cache.
 */

vi.mock(
  'next/cache.js',
  async () => (await import('./support/nextDataCacheFake.ts')).nextDataCacheFake,
)
vi.mock('next/server.js', () => ({ after: (callback: () => void): void => callback() }))

test('with healthCheck.cache: false, the report reflects a write handled by another instance', async () => {
  const { fillOnAnotherInstance, missingDocs, payload } = await setupHealthCacheInstance({
    cache: false,
  })

  assert.equal(await missingDocs(), 1)
  await fillOnAnotherInstance()

  assert.equal(await missingDocs(), 0)
  await payload.destroy()
})
