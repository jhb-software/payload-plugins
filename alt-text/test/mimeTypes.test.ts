import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  buildMimeTypeWhere,
  DEFAULT_TRACKED_MIME_TYPES,
  matchesMimeType,
  normalizeCollectionsConfig,
  shouldShowAltTextField,
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

describe('shouldShowAltTextField', () => {
  test('shows the field for an existing document whose mime type matches', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: 'image/png',
        trackedMimeTypes: ['image/*'],
      }),
      true,
    )
  })

  test('hides the field for an existing document whose mime type does not match', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: 'video/mp4',
        trackedMimeTypes: ['image/*'],
      }),
      false,
    )
  })

  test('shows the field for a freshly dropped image on create when no mime type is saved yet', () => {
    // Reproduces the create-flow regression: before the upload is processed
    // server-side, `mimeType` is empty in the form. The browser-detected file
    // type from the dropzone must drive visibility instead.
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: undefined,
        trackedMimeTypes: ['image/*'],
        uploadedFileMimeType: 'image/png',
      }),
      true,
    )
  })

  test('keeps the field hidden when a freshly dropped file is not a tracked mime type', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: undefined,
        trackedMimeTypes: ['image/*'],
        uploadedFileMimeType: 'application/pdf',
      }),
      false,
    )
  })

  test('hides the field when neither the document nor a dropped file has a mime type yet', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: undefined,
        trackedMimeTypes: ['image/*'],
        uploadedFileMimeType: undefined,
      }),
      false,
    )
  })

  test('shows the field unconditionally when no trackedMimeTypes are configured', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: undefined,
        trackedMimeTypes: undefined,
        uploadedFileMimeType: undefined,
      }),
      true,
    )
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: undefined,
        trackedMimeTypes: [],
        uploadedFileMimeType: undefined,
      }),
      true,
    )
  })

  test('prefers the saved document mime type over a stale dropped file', () => {
    assert.equal(
      shouldShowAltTextField({
        documentMimeType: 'image/png',
        trackedMimeTypes: ['image/*'],
        uploadedFileMimeType: 'application/pdf',
      }),
      true,
    )
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
