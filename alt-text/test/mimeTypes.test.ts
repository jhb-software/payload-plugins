import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  buildMimeTypeWhere,
  DEFAULT_TRACKED_MIME_TYPES,
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

describe('buildMimeTypeWhere', () => {
  test('returns null for an empty pattern list so callers can skip the query', () => {
    assert.equal(buildMimeTypeWhere([]), null)
  })

  test('returns an `in` clause for a single exact pattern', () => {
    assert.deepEqual(buildMimeTypeWhere(['image/png']), {
      mimeType: { in: ['image/png'] },
    })
  })

  test('groups multiple exact patterns into a single `in` clause', () => {
    assert.deepEqual(buildMimeTypeWhere(['image/png', 'image/jpeg']), {
      mimeType: { in: ['image/png', 'image/jpeg'] },
    })
  })

  test('translates a single wildcard pattern into a `like` prefix match', () => {
    assert.deepEqual(buildMimeTypeWhere(['image/*']), {
      mimeType: { like: 'image/' },
    })
  })

  test('combines exacts and wildcards with `or`', () => {
    assert.deepEqual(buildMimeTypeWhere(['image/*', 'application/pdf']), {
      or: [{ mimeType: { in: ['application/pdf'] } }, { mimeType: { like: 'image/' } }],
    })
  })
})
