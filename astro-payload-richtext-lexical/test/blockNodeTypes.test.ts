import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { BlockNode, InlineBlockNode } from '../src/types.js'

/**
 * These tests verify that BlockNode uses IdType (string | number) for its
 * id field, consistent with InlineBlockNode and UploadNode.
 *
 * See https://github.com/jhb-software/payload-plugins/issues/70
 */

describe('BlockNode ID types', () => {
  test('accepts string ID (MongoDB)', () => {
    const block: BlockNode = {
      type: 'block',
      version: 1,
      fields: {
        id: '507f1f77bcf86cd799439011',
        blockName: 'Hero',
        blockType: 'hero',
      },
    }
    assert.equal(typeof block.fields.id, 'string')
  })

  test('accepts numeric ID (PostgreSQL)', () => {
    const block: BlockNode = {
      type: 'block',
      version: 1,
      fields: {
        id: 42,
        blockName: 'Hero',
        blockType: 'hero',
      },
    }
    assert.equal(typeof block.fields.id, 'number')
  })

  test('InlineBlockNode already supports both ID types', () => {
    const stringBlock: InlineBlockNode = {
      type: 'inlineBlock',
      version: 1,
      fields: { id: 'abc', blockName: 'Test', blockType: 'test' },
    }
    const numericBlock: InlineBlockNode = {
      type: 'inlineBlock',
      version: 1,
      fields: { id: 123, blockName: 'Test', blockType: 'test' },
    }
    assert.equal(typeof stringBlock.fields.id, 'string')
    assert.equal(typeof numericBlock.fields.id, 'number')
  })
})
