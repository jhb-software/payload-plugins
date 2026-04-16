import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  DEFAULT_TRACKED_MIME_TYPES,
  filterDocsByMimeType,
  matchesMimeType,
  normalizeCollectionsConfig,
} from '../src/utilities/mimeTypes.ts'

describe('matchesMimeType', () => {
  test('returns true for an exact match', () => {
    assert.equal(matchesMimeType('image/png', ['image/png']), true)
  })

  test('returns false when no pattern matches', () => {
    assert.equal(matchesMimeType('video/mp4', ['image/png', 'image/jpeg']), false)
  })

  test('matches a wildcard pattern with the given top-level type', () => {
    assert.equal(matchesMimeType('image/jpeg', ['image/*']), true)
    assert.equal(matchesMimeType('image/svg+xml', ['image/*']), true)
  })

  test('does not cross top-level types for wildcards', () => {
    assert.equal(matchesMimeType('video/mp4', ['image/*']), false)
  })

  test('succeeds when any of multiple patterns match', () => {
    assert.equal(matchesMimeType('application/pdf', ['image/*', 'application/pdf']), true)
  })

  test('returns false for an empty pattern list', () => {
    assert.equal(matchesMimeType('image/png', []), false)
  })
})

describe('normalizeCollectionsConfig', () => {
  test('expands a bare slug string to the default tracked mime types', () => {
    const result = normalizeCollectionsConfig(['media'])

    assert.deepEqual(result, [{ slug: 'media', mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES] }])
  })

  test('preserves an explicit mimeTypes array', () => {
    const result = normalizeCollectionsConfig([
      { slug: 'media', mimeTypes: ['image/png', 'image/svg+xml'] },
    ])

    assert.deepEqual(result, [{ slug: 'media', mimeTypes: ['image/png', 'image/svg+xml'] }])
  })

  test('defaults mimeTypes when an object omits them', () => {
    const result = normalizeCollectionsConfig([{ slug: 'media' }])

    assert.deepEqual(result, [{ slug: 'media', mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES] }])
  })

  test('supports mixed entries', () => {
    const result = normalizeCollectionsConfig([
      'images',
      { slug: 'media', mimeTypes: ['image/png'] },
    ])

    assert.deepEqual(result, [
      { slug: 'images', mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES] },
      { slug: 'media', mimeTypes: ['image/png'] },
    ])
  })
})

describe('filterDocsByMimeType', () => {
  test('keeps only docs whose mime type matches a pattern', () => {
    const docs = [
      { id: '1', mimeType: 'image/jpeg' },
      { id: '2', mimeType: 'video/mp4' },
      { id: '3', mimeType: 'image/png' },
      { id: '4', mimeType: 'application/pdf' },
    ]

    const result = filterDocsByMimeType(docs, ['image/*'])

    assert.deepEqual(
      result.map((doc) => doc.id),
      ['1', '3'],
    )
  })

  test('drops docs without a mime type', () => {
    const docs = [
      { id: '1', mimeType: 'image/jpeg' },
      { id: '2', mimeType: undefined },
      { id: '3', mimeType: null as unknown as string },
    ]

    const result = filterDocsByMimeType(docs, ['image/*'])

    assert.deepEqual(
      result.map((doc) => doc.id),
      ['1'],
    )
  })

  test('returns an empty list when no patterns are given', () => {
    const docs = [{ id: '1', mimeType: 'image/jpeg' }]

    assert.deepEqual(filterDocsByMimeType(docs, []), [])
  })
})
