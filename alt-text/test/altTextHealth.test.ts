import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { MAX_INVALID_DOC_IDS, summarizeCollection } from '../src/utilities/summarizeCollection.ts'

describe('summarizeCollection (non-localized)', () => {
  const baseArgs = { collection: 'media', isLocalized: false, localeCodes: [] }

  test('counts docs with alt text as complete', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [
        { alt: 'A sunset', id: '1' },
        { alt: 'A tree', id: '2' },
      ],
    })

    assert.equal(result.completeDocs, 2)
    assert.equal(result.missingDocs, 0)
    assert.equal(result.totalDocs, 2)
  })

  test('counts docs without alt text as missing', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [
        { alt: '', id: '1' },
        { alt: undefined, id: '2' },
        { alt: null, id: '3' },
        { alt: '   ', id: '4' },
      ],
    })

    assert.equal(result.completeDocs, 0)
    assert.equal(result.missingDocs, 4)
    assert.deepEqual(result.invalidDocIds, ['1', '2', '3', '4'])
  })

  test('tracks mixed complete and missing docs', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [
        { alt: 'A photo', id: '1' },
        { alt: '', id: '2' },
        { alt: 'Another', id: '3' },
      ],
    })

    assert.equal(result.completeDocs, 2)
    assert.equal(result.missingDocs, 1)
    assert.deepEqual(result.invalidDocIds, ['2'])
  })

  test('never produces partialDocs in non-localized mode', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [{ alt: '', id: '1' }],
    })

    assert.equal(result.partialDocs, 0)
  })

  test('caps invalidDocIds at MAX_INVALID_DOC_IDS', () => {
    const docs = Array.from({ length: MAX_INVALID_DOC_IDS + 20 }, (_, i) => ({
      alt: '',
      id: String(i),
    }))

    const result = summarizeCollection({ ...baseArgs, docs })

    assert.equal(result.invalidDocIds, undefined)
    assert.equal(result.missingDocs, MAX_INVALID_DOC_IDS + 20)
  })

  test('returns empty result for empty collection', () => {
    const result = summarizeCollection({ ...baseArgs, docs: [] })

    assert.equal(result.totalDocs, 0)
    assert.equal(result.completeDocs, 0)
    assert.equal(result.missingDocs, 0)
    assert.deepEqual(result.invalidDocIds, [])
  })
})

describe('summarizeCollection (localized)', () => {
  const baseArgs = { collection: 'media', isLocalized: true, localeCodes: ['en', 'de'] }

  test('counts doc as complete when all locales have alt text', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [{ alt: { de: 'Ein Foto', en: 'A photo' }, id: '1' }],
    })

    assert.equal(result.completeDocs, 1)
    assert.equal(result.missingDocs, 0)
    assert.equal(result.partialDocs, 0)
  })

  test('counts doc as partial when some locales have alt text', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [{ alt: { de: '', en: 'A photo' }, id: '1' }],
    })

    assert.equal(result.completeDocs, 0)
    assert.equal(result.missingDocs, 0)
    assert.equal(result.partialDocs, 1)
    assert.deepEqual(result.invalidDocIds, ['1'])
  })

  test('counts doc as missing when no locales have alt text', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [{ alt: { de: '', en: '' }, id: '1' }],
    })

    assert.equal(result.completeDocs, 0)
    assert.equal(result.missingDocs, 1)
    assert.equal(result.partialDocs, 0)
  })

  test('counts doc as missing when alt is not a record', () => {
    const result = summarizeCollection({
      ...baseArgs,
      docs: [
        { alt: undefined, id: '1' },
        { alt: null, id: '2' },
        { alt: 'flat string', id: '3' },
      ],
    })

    assert.equal(result.missingDocs, 3)
    assert.equal(result.partialDocs, 0)
  })
})
