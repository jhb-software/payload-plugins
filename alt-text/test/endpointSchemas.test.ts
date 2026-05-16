import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ZodError } from 'zod'

import {
  bulkGenerateAltTextsRequestSchema,
  formatZodError,
  generateAltTextRequestSchema,
} from '../src/endpoints/schemas.ts'

describe('generateAltText endpoint schema', () => {
  test('accepts string id', () => {
    const result = generateAltTextRequestSchema.parse({
      id: '1',
      collection: 'media',
      locale: null,
    })
    assert.equal(result.id, '1')
  })

  test('accepts numeric id', () => {
    const result = generateAltTextRequestSchema.parse({
      id: 42,
      collection: 'media',
      locale: null,
    })
    assert.equal(result.id, 42)
  })

  test('defaults update to false when omitted', () => {
    const result = generateAltTextRequestSchema.parse({
      id: '1',
      collection: 'media',
      locale: 'en',
    })
    assert.equal(result.update, false)
  })

  test('accepts update: true', () => {
    const result = generateAltTextRequestSchema.parse({
      id: '1',
      collection: 'media',
      locale: 'en',
      update: true,
    })
    assert.equal(result.update, true)
  })
})

describe('bulkGenerateAltTexts endpoint schema', () => {
  test('accepts string ids', () => {
    const result = bulkGenerateAltTextsRequestSchema.parse({
      collection: 'media',
      ids: ['1', '2'],
    })
    assert.deepEqual(result.ids, ['1', '2'])
  })

  test('accepts numeric ids', () => {
    const result = bulkGenerateAltTextsRequestSchema.parse({
      collection: 'media',
      ids: [1, 2, 3],
    })
    assert.deepEqual(result.ids, [1, 2, 3])
  })
})

describe('endpoint validation error formatting', () => {
  test('returns structured error with path for missing id', () => {
    try {
      generateAltTextRequestSchema.parse({ collection: 'media', locale: 'en' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.equal(formatted.error, 'Validation failed')
      assert.ok(formatted.details.some((d) => d.path === 'id'))
    }
  })

  test('bulk schema rejects non-array ids with structured error', () => {
    try {
      bulkGenerateAltTextsRequestSchema.parse({ collection: 'media', ids: 'not-an-array' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.equal(formatted.error, 'Validation failed')
      assert.ok(formatted.details.some((d) => d.path === 'ids'))
    }
  })
})
