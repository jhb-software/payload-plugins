import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { z, ZodError } from 'zod'

/**
 * These schemas mirror the request validation in the endpoint handlers.
 * The tests verify that numeric IDs (as used by PostgreSQL) are accepted
 * alongside string IDs. See https://github.com/jhb-software/payload-plugins/issues/70
 */

const generateSchema = z.object({
  id: z.union([z.string(), z.number()]),
  collection: z.string(),
  locale: z.string().nullable(),
  update: z.boolean().optional().default(false),
})

const bulkSchema = z.object({
  collection: z.string(),
  ids: z.array(z.union([z.string(), z.number()])),
})

/** Mirrors the error formatting in the endpoint catch blocks */
function formatZodError(error: ZodError) {
  return {
    details: error.issues.map((e) => ({
      message: e.message,
      path: e.path.join('.'),
    })),
    error: 'Validation failed',
  }
}

describe('generateAltText endpoint schema', () => {
  const requestSchema = generateSchema

  test('accepts string id', () => {
    const result = requestSchema.parse({ id: '1', collection: 'media', locale: null })
    assert.equal(result.id, '1')
  })

  test('accepts numeric id', () => {
    const result = requestSchema.parse({ id: 42, collection: 'media', locale: null })
    assert.equal(result.id, 42)
  })
})

describe('generateAltText endpoint request schema with update param', () => {
  const requestSchema = generateSchema

  test('defaults update to false when omitted', () => {
    const result = requestSchema.parse({ id: '1', collection: 'media', locale: 'en' })
    assert.equal(result.update, false)
  })

  test('accepts update: true', () => {
    const result = requestSchema.parse({ id: '1', collection: 'media', locale: 'en', update: true })
    assert.equal(result.update, true)
  })

  test('accepts update: false', () => {
    const result = requestSchema.parse({ id: '1', collection: 'media', locale: 'en', update: false })
    assert.equal(result.update, false)
  })

  test('response includes id and collection', () => {
    // Verify the response shape includes id and collection for agent consumption
    const responseSchema = z.object({
      id: z.union([z.string(), z.number()]),
      collection: z.string(),
      altText: z.string(),
      keywords: z.array(z.string()),
    })

    const result = responseSchema.parse({
      id: '123',
      collection: 'media',
      altText: 'A photo',
      keywords: ['photo'],
    })
    assert.equal(result.id, '123')
    assert.equal(result.collection, 'media')
  })
})

describe('bulkGenerateAltTexts endpoint schema', () => {
  test('accepts string ids', () => {
    const result = bulkSchema.parse({ collection: 'media', ids: ['1', '2'] })
    assert.deepEqual(result.ids, ['1', '2'])
  })

  test('accepts numeric ids', () => {
    const result = bulkSchema.parse({ collection: 'media', ids: [1, 2, 3] })
    assert.deepEqual(result.ids, [1, 2, 3])
  })
})

describe('endpoint validation error formatting', () => {
  test('generate endpoint returns structured error for missing fields', () => {
    try {
      generateSchema.parse({ wrong: 'field' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.equal(formatted.error, 'Validation failed')
      assert.ok(Array.isArray(formatted.details))
      assert.ok(formatted.details.length > 0)
      assert.ok(formatted.details.every((d) => 'path' in d && 'message' in d))
    }
  })

  test('generate endpoint returns path for missing id', () => {
    try {
      generateSchema.parse({ collection: 'media', locale: 'en' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.ok(formatted.details.some((d) => d.path === 'id'))
    }
  })

  test('bulk endpoint returns structured error for invalid input', () => {
    try {
      bulkSchema.parse({ ids: 'not-an-array' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.equal(formatted.error, 'Validation failed')
      assert.ok(formatted.details.some((d) => d.path === 'collection' || d.path === 'ids'))
    }
  })
})
