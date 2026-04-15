import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validateAltText } from '../src/fields/validateAltText.ts'

/**
 * The validator enforces alt text only when the alt field is part of the
 * incoming request body (`req.data`). Partial updates (folder moves, etc.)
 * that do not touch alt are skipped. When alt is submitted, a non-empty
 * value is required.
 */

const t = ((key: string) => key) as unknown as Parameters<typeof validateAltText>[1]['req']['t']

function runValidate(
  value: string | null | undefined,
  opts: {
    operation: 'create' | 'update'
    reqData?: Record<string, unknown>
    createdAt?: string
    updatedAt?: string
  },
) {
  return validateAltText(
    value as string,
    {
      data: {
        createdAt: opts.createdAt ?? '2025-01-01T00:00:00.000Z',
        updatedAt: opts.updatedAt ?? '2025-02-01T00:00:00.000Z',
      },
      operation: opts.operation,
      req: { data: opts.reqData, t },
    } as unknown as Parameters<typeof validateAltText>[1],
  )
}

describe('validateAltText', () => {
  test('skips validation on create (AI fills in alt after upload)', () => {
    assert.equal(runValidate('', { operation: 'create', reqData: { alt: '' } }), true)
  })

  test('skips validation on the first save after upload (createdAt === updatedAt)', () => {
    const ts = '2025-02-01T00:00:00.000Z'
    assert.equal(
      runValidate('', {
        operation: 'update',
        createdAt: ts,
        updatedAt: ts,
        reqData: { alt: '' },
      }),
      true,
    )
  })

  // https://github.com/jhb-software/payload-plugins/issues/95
  test('skips validation when alt is not in the request body (folder move, partial update)', () => {
    assert.equal(runValidate(null, { operation: 'update', reqData: { folder: 'folder-id' } }), true)
  })

  test('accepts a non-empty value when alt is submitted', () => {
    assert.equal(
      runValidate('A sunset', { operation: 'update', reqData: { alt: 'A sunset' } }),
      true,
    )
  })

  test('rejects an empty or whitespace-only value when alt is submitted', () => {
    assert.equal(typeof runValidate('', { operation: 'update', reqData: { alt: '' } }), 'string')
    assert.equal(
      typeof runValidate('   ', { operation: 'update', reqData: { alt: '   ' } }),
      'string',
    )
  })

  test('rejects null submitted via API (clearing alt)', () => {
    const result = runValidate(null, { operation: 'update', reqData: { alt: null } })
    assert.equal(typeof result, 'string')
  })
})
