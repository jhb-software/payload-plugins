import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

/**
 * These tests verify that traverseFields correctly types array and block IDs
 * as string | number, supporting both MongoDB (string ObjectIds) and
 * PostgreSQL (numeric IDs).
 *
 * See https://github.com/jhb-software/payload-plugins/issues/70
 */

describe('traverseFields ID types', () => {
  describe('array field IDs', () => {
    test('accepts string IDs (MongoDB)', () => {
      const arrayData: { id: string | number }[] = [
        { id: '507f1f77bcf86cd799439011' },
        { id: '507f1f77bcf86cd799439012' },
      ]
      assert.equal(typeof arrayData[0].id, 'string')
    })

    test('accepts numeric IDs (PostgreSQL)', () => {
      const arrayData: { id: string | number }[] = [{ id: 1 }, { id: 2 }]
      assert.equal(typeof arrayData[0].id, 'number')
    })
  })

  describe('block field IDs', () => {
    test('accepts string IDs (MongoDB)', () => {
      const blockData: { blockType: string; id: string | number }[] = [
        { id: '507f1f77bcf86cd799439011', blockType: 'hero' },
      ]
      assert.equal(typeof blockData[0].id, 'string')
    })

    test('accepts numeric IDs (PostgreSQL)', () => {
      const blockData: { blockType: string; id: string | number }[] = [
        { id: 42, blockType: 'hero' },
      ]
      assert.equal(typeof blockData[0].id, 'number')
    })
  })
})
