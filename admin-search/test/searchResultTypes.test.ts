import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { SearchResultDocument } from '../src/types/SearchResult.js'

/**
 * These tests verify that SearchResultDocument supports both string and
 * numeric document IDs, for compatibility with MongoDB and PostgreSQL.
 *
 * See https://github.com/jhb-software/payload-plugins/issues/70
 */

describe('SearchResultDocument ID types', () => {
  test('accepts string doc value (MongoDB)', () => {
    const result: SearchResultDocument = {
      doc: { relationTo: 'posts', value: '507f1f77bcf86cd799439011' },
      id: 'search-1',
      title: 'Test Post',
      type: 'document',
    }
    assert.equal(typeof result.doc.value, 'string')
  })

  test('accepts numeric doc value (PostgreSQL)', () => {
    const result: SearchResultDocument = {
      doc: { relationTo: 'posts', value: 42 },
      id: 'search-1',
      title: 'Test Post',
      type: 'document',
    }
    assert.equal(typeof result.doc.value, 'number')
  })
})
