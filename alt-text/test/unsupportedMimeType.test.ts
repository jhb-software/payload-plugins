import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { isUnsupportedMimeType } from '../src/utilities/isUnsupportedMimeType.js'

describe('isUnsupportedMimeType', () => {
  test('rejects image/svg+xml', () => {
    assert.equal(isUnsupportedMimeType('image/svg+xml'), true)
  })

  test('accepts image/jpeg', () => {
    assert.equal(isUnsupportedMimeType('image/jpeg'), false)
  })

  test('accepts image/png', () => {
    assert.equal(isUnsupportedMimeType('image/png'), false)
  })

  test('accepts image/gif', () => {
    assert.equal(isUnsupportedMimeType('image/gif'), false)
  })

  test('accepts image/webp', () => {
    assert.equal(isUnsupportedMimeType('image/webp'), false)
  })

  test('accepts undefined mimeType', () => {
    assert.equal(isUnsupportedMimeType(undefined), false)
  })

  test('accepts null mimeType', () => {
    assert.equal(isUnsupportedMimeType(null), false)
  })
})
