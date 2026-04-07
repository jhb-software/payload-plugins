import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { z } from 'zod'

/**
 * These schemas mirror the request validation in the endpoint handlers.
 * The tests verify that numeric IDs (as used by PostgreSQL) are accepted
 * and coerced to strings. See https://github.com/jhb-software/payload-plugins/issues/70
 */

describe('generateAltText endpoint schema', () => {
  const requestSchema = z.object({
    id: z.coerce.string(),
    collection: z.string(),
    locale: z.string().nullable(),
  })

  test('accepts string id', () => {
    const result = requestSchema.parse({ id: '1', collection: 'media', locale: null })
    assert.equal(result.id, '1')
  })

  test('accepts numeric id and coerces to string', () => {
    const result = requestSchema.parse({ id: 42, collection: 'media', locale: null })
    assert.equal(result.id, '42')
  })
})

describe('bulkGenerateAltTexts endpoint schema', () => {
  const schema = z.object({
    collection: z.string(),
    ids: z.array(z.coerce.string()),
  })

  test('accepts string ids', () => {
    const result = schema.parse({ collection: 'media', ids: ['1', '2'] })
    assert.deepEqual(result.ids, ['1', '2'])
  })

  test('accepts numeric ids and coerces to strings', () => {
    const result = schema.parse({ collection: 'media', ids: [1, 2, 3] })
    assert.deepEqual(result.ids, ['1', '2', '3'])
  })
})
