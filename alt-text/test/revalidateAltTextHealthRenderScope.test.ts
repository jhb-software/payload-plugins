import assert from 'node:assert/strict'

import type { PayloadRequest } from 'payload'

import { describe, test, vi } from 'vitest'

import {
  createRevalidateAltTextHealthAfterChangeHook,
  createRevalidateAltTextHealthAfterDeleteHook,
} from '../src/hooks/revalidateAltTextHealth.ts'
import { getAltTextHealthCollectionTag } from '../src/utilities/altTextHealth.ts'

/**
 * Behavioral fake of the Next.js runtime boundary. Instead of recording
 * calls, it mirrors what Next actually does in each execution context:
 * `revalidateTag` throws while a render is in progress and when no store
 * exists at all, and `after` defers callbacks past the render — or throws
 * when there is no request scope (CLI, migrations, scripts).
 */
const nextRuntime = vi.hoisted(() => {
  type Phase = 'render' | 'after-response' | 'no-context'

  const state = {
    afterQueue: [] as Array<() => void>,
    phase: 'render' as Phase,
    revalidatedTags: [] as string[],
  }

  return {
    /** Simulates the response finishing: Next runs deferred callbacks outside the render. */
    flushAfterCallbacks: (): void => {
      state.phase = 'after-response'
      for (const callback of state.afterQueue.splice(0)) {
        callback()
      }
    },
    reset: (phase: Phase): void => {
      state.afterQueue = []
      state.phase = phase
      state.revalidatedTags = []
    },
    state,
  }
})

vi.mock('next/cache.js', () => ({
  revalidateTag: (tag: string): void => {
    if (nextRuntime.state.phase === 'render') {
      throw new Error('Route /admin used "revalidateTag …" during render which is unsupported.')
    }

    if (nextRuntime.state.phase === 'no-context') {
      throw new Error('Invariant: static generation store missing in revalidateTag')
    }

    nextRuntime.state.revalidatedTags.push(tag)
  },
}))

vi.mock('next/server.js', () => ({
  after: (callback: () => void): void => {
    if (nextRuntime.state.phase === 'no-context') {
      throw new Error('`after` was called outside a request scope.')
    }

    nextRuntime.state.afterQueue.push(callback)
  },
}))

function buildReq(): { req: PayloadRequest; warnings: { msg?: string }[] } {
  const warnings: { msg?: string }[] = []

  const req = {
    context: {},
    payload: { logger: { warn: (entry: { msg?: string }) => warnings.push(entry) } },
  } as unknown as PayloadRequest

  return { req, warnings }
}

const hookFactories = {
  afterChange: createRevalidateAltTextHealthAfterChangeHook,
  afterDelete: createRevalidateAltTextHealthAfterDeleteHook,
} as const

describe('alt text health cache revalidation across Next.js execution contexts', () => {
  for (const [hookName, createHook] of Object.entries(hookFactories)) {
    test(`a write during a server-component render completes without crashing and the ${hookName} revalidation runs after the response`, async () => {
      nextRuntime.reset('render')
      const { req } = buildReq()
      const doc = { id: 'doc-1' }

      const hook = createHook('media') as (args: unknown) => unknown
      const result = await hook({ doc, req })

      assert.equal(result, doc)
      assert.deepEqual(
        nextRuntime.state.revalidatedTags,
        [],
        'revalidation must not run synchronously during render',
      )

      nextRuntime.flushAfterCallbacks()

      assert.deepEqual(nextRuntime.state.revalidatedTags, [getAltTextHealthCollectionTag('media')])
    })
  }

  test('a write outside any Next.js request scope warns and skips instead of failing the operation', async () => {
    nextRuntime.reset('no-context')
    const { req, warnings } = buildReq()
    const doc = { id: 'doc-1' }

    const hook = createRevalidateAltTextHealthAfterChangeHook('media') as (args: unknown) => unknown
    const result = await hook({ doc, req })

    assert.equal(result, doc)
    assert.deepEqual(nextRuntime.state.revalidatedTags, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]?.msg ?? '', /Skipping alt text health cache revalidation/)
  })
})
