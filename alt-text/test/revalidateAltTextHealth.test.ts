import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createRevalidateAltTextHealthAfterChangeHookWithDeps,
  safeRevalidateAltTextHealthTag,
} from '../src/hooks/revalidateAltTextHealth.core.ts'
import { getAltTextHealthCollectionTag } from '../src/utilities/altTextHealthTags.ts'

const createReq = (warnSink: unknown[] = []): PayloadRequest =>
  ({
    payload: { logger: { warn: (entry: unknown) => warnSink.push(entry) } },
  }) as unknown as PayloadRequest

describe('safeRevalidateAltTextHealthTag', () => {
  test('does not call revalidateTag synchronously — defers via after() to escape the render scope', () => {
    const directCalls: string[] = []
    const deferred: Array<() => void> = []

    safeRevalidateAltTextHealthTag(createReq(), 'alt-text-health:media', {
      after: (cb) => {
        deferred.push(cb)
      },
      revalidateTag: (tag) => {
        directCalls.push(tag)
      },
    })

    assert.equal(directCalls.length, 0, 'revalidateTag must not be called during render')
    assert.equal(deferred.length, 1, 'after() should have queued exactly one callback')

    deferred[0]!()
    assert.deepEqual(directCalls, ['alt-text-health:media'])
  })

  test('does not throw when invoked from a render scope where direct revalidateTag would error', () => {
    // Reproduces the user-observable bug: `payload.create` from `onInit` runs
    // while the admin route is rendering. Next.js throws when `revalidateTag` is
    // called synchronously during render. With the fix, the hook defers the
    // call via `after()` and the create completes successfully.
    const renderScopeRevalidateTag = (tag: string): void => {
      throw new Error(
        `Route /admin/[[...segments]] used "revalidateTag ${tag}" during render which is unsupported.`,
      )
    }

    const deferred: Array<() => void> = []

    assert.doesNotThrow(() => {
      safeRevalidateAltTextHealthTag(createReq(), 'alt-text-health:media', {
        after: (cb) => {
          deferred.push(cb)
        },
        revalidateTag: renderScopeRevalidateTag,
      })
    })

    assert.equal(deferred.length, 1)
  })

  test('falls back to a direct revalidateTag call when after() is not in a request scope (CLI / migrations)', () => {
    const directCalls: string[] = []

    safeRevalidateAltTextHealthTag(createReq(), 'alt-text-health:media', {
      after: () => {
        throw new Error(
          '`after()` from `next/server` requires Request scope, which is not available outside of a server request.',
        )
      },
      revalidateTag: (tag) => {
        directCalls.push(tag)
      },
    })

    assert.deepEqual(directCalls, ['alt-text-health:media'])
  })

  test('warns and skips when neither after() nor revalidateTag have a Next.js context', () => {
    const warnSink: unknown[] = []

    safeRevalidateAltTextHealthTag(createReq(warnSink), 'alt-text-health:media', {
      after: () => {
        throw new Error('after() requires Request scope')
      },
      revalidateTag: () => {
        throw new Error('Invariant: static generation store missing in revalidateTag')
      },
    })

    assert.equal(warnSink.length, 1)
    assert.match(JSON.stringify(warnSink[0]), /Skipping alt text health cache revalidation/)
  })

  test('rethrows unknown revalidateTag errors so they are not silently swallowed', () => {
    assert.throws(
      () =>
        safeRevalidateAltTextHealthTag(createReq(), 'alt-text-health:media', {
          after: () => {
            throw new Error('after() requires Request scope')
          },
          revalidateTag: () => {
            throw new Error('boom: unrelated failure')
          },
        }),
      /boom: unrelated failure/,
    )
  })
})

describe('createRevalidateAltTextHealthAfterChangeHookWithDeps', () => {
  test('skips revalidation when req.context.disableRevalidate is set (seed / batch import escape hatch)', () => {
    const deferred: Array<() => void> = []
    const directCalls: string[] = []

    const hook = createRevalidateAltTextHealthAfterChangeHookWithDeps('alt-text-health:media', {
      after: (cb) => {
        deferred.push(cb)
      },
      revalidateTag: (tag) => {
        directCalls.push(tag)
      },
    })

    const req = {
      context: { disableRevalidate: true },
      payload: { logger: { warn: () => {} } },
    } as unknown as PayloadRequest

    const doc = { id: '1' }
    const result = hook({ doc, req } as Parameters<typeof hook>[0])

    assert.equal(result, doc)
    assert.equal(deferred.length, 0)
    assert.equal(directCalls.length, 0)
  })

  test('schedules a deferred revalidation for the per-collection tag on every change', () => {
    const deferred: Array<() => void> = []
    const directCalls: string[] = []

    const tag = getAltTextHealthCollectionTag('media')
    const hook = createRevalidateAltTextHealthAfterChangeHookWithDeps(tag, {
      after: (cb) => {
        deferred.push(cb)
      },
      revalidateTag: (tag) => {
        directCalls.push(tag)
      },
    })

    const req = { payload: { logger: { warn: () => {} } } } as unknown as PayloadRequest
    hook({ doc: { id: '1' }, req } as Parameters<typeof hook>[0])
    hook({ doc: { id: '2' }, req } as Parameters<typeof hook>[0])

    assert.equal(directCalls.length, 0, 'no synchronous revalidations during render')
    assert.equal(deferred.length, 2)

    for (const cb of deferred) cb()
    assert.deepEqual(directCalls, [tag, tag])
    assert.equal(tag, 'alt-text-health:media')
  })
})
