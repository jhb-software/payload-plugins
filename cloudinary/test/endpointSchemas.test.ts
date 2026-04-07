import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { z, ZodError } from 'zod'

/**
 * These schemas mirror the request validation in the generateSignature endpoint.
 * The tests verify schema correctness and consistent error formatting
 * across all plugins.
 */

const generateSignatureRequestSchema = z.object({
  paramsToSign: z.record(z.string(), z.unknown()),
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

describe('generateSignature endpoint schema', () => {
  test('accepts valid paramsToSign object', () => {
    const result = generateSignatureRequestSchema.parse({
      paramsToSign: { timestamp: 1234567890, folder: 'uploads' },
    })
    assert.deepEqual(result.paramsToSign, { timestamp: 1234567890, folder: 'uploads' })
  })

  test('accepts empty paramsToSign object', () => {
    const result = generateSignatureRequestSchema.parse({ paramsToSign: {} })
    assert.deepEqual(result.paramsToSign, {})
  })

  test('rejects missing paramsToSign', () => {
    try {
      generateSignatureRequestSchema.parse({})
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
    }
  })

  test('rejects non-object paramsToSign', () => {
    try {
      generateSignatureRequestSchema.parse({ paramsToSign: 'not-an-object' })
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
    }
  })
})

describe('generateSignature endpoint validation error formatting', () => {
  test('returns structured error with details array', () => {
    try {
      generateSignatureRequestSchema.parse({})
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

  test('returns path for missing paramsToSign', () => {
    try {
      generateSignatureRequestSchema.parse({})
      assert.fail('should have thrown')
    } catch (error) {
      assert.ok(error instanceof ZodError)
      const formatted = formatZodError(error)
      assert.ok(formatted.details.some((d) => d.path === 'paramsToSign'))
    }
  })
})
