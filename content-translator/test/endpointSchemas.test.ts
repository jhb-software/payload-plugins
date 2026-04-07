import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { z, ZodError } from 'zod'

/**
 * These schemas mirror the request validation in the endpoint handler.
 * The tests verify schema correctness and consistent error formatting
 * across all plugins.
 */

const translateRequestSchema = z.object({
  collectionSlug: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  emptyOnly: z.boolean().optional(),
  globalSlug: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  locale: z.string(),
  localeFrom: z.string(),
})

/** Mirrors the error formatting in the endpoint catch block */
function formatZodError(error: ZodError) {
  return {
    details: error.issues.map((e) => ({
      message: e.message,
      path: e.path.join('.'),
    })),
    error: 'Validation failed',
  }
}

describe('translate endpoint schema', () => {
  test('accepts minimal valid request with collection', () => {
    const result = translateRequestSchema.parse({
      collectionSlug: 'posts',
      id: '123',
      locale: 'de',
      localeFrom: 'en',
    })
    assert.equal(result.collectionSlug, 'posts')
    assert.equal(result.locale, 'de')
    assert.equal(result.localeFrom, 'en')
  })

  test('accepts request with global slug', () => {
    const result = translateRequestSchema.parse({
      globalSlug: 'settings',
      locale: 'de',
      localeFrom: 'en',
    })
    assert.equal(result.globalSlug, 'settings')
  })

  test('accepts numeric id (PostgreSQL)', () => {
    const result = translateRequestSchema.parse({
      collectionSlug: 'posts',
      id: 42,
      locale: 'de',
      localeFrom: 'en',
    })
    assert.equal(result.id, 42)
  })

  test('accepts string id (MongoDB)', () => {
    const result = translateRequestSchema.parse({
      collectionSlug: 'posts',
      id: '507f1f77bcf86cd799439011',
      locale: 'de',
      localeFrom: 'en',
    })
    assert.equal(result.id, '507f1f77bcf86cd799439011')
  })

  test('accepts emptyOnly flag', () => {
    const result = translateRequestSchema.parse({
      collectionSlug: 'posts',
      emptyOnly: true,
      id: '1',
      locale: 'de',
      localeFrom: 'en',
    })
    assert.equal(result.emptyOnly, true)
  })

  test('rejects missing locale', () => {
    try {
      translateRequestSchema.parse({ collectionSlug: 'posts', localeFrom: 'en' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
    }
  })

  test('rejects missing localeFrom', () => {
    try {
      translateRequestSchema.parse({ collectionSlug: 'posts', locale: 'de' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
    }
  })
})

describe('translate endpoint validation error formatting', () => {
  test('returns structured error with details array', () => {
    try {
      translateRequestSchema.parse({})
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

  test('returns path for missing locale', () => {
    try {
      translateRequestSchema.parse({ localeFrom: 'en' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.ok(formatted.details.some((d) => d.path === 'locale'))
    }
  })
})
