import type { Field, SanitizedConfig } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ValueToTranslate } from '../src/translate/types.ts'

import { traverseFields } from '../src/translate/traverseFields.ts'

const payloadConfig = {} as SanitizedConfig

const runTraverse = (fields: Field[], dataFrom: Record<string, unknown>, emptyOnly: boolean) => {
  const translatedData: Record<string, unknown> = {}
  const valuesToTranslate: ValueToTranslate[] = []

  traverseFields({
    dataFrom,
    emptyOnly,
    fields,
    payloadConfig,
    translatedData,
    valuesToTranslate,
  })

  for (const v of valuesToTranslate) {
    v.onTranslate(`TRANSLATED:${v.value}`)
  }

  return translatedData
}

describe('traverseFields ID types', () => {
  describe('array field IDs', () => {
    test('accepts string IDs (MongoDB)', () => {
      const arrayData: { id: number | string }[] = [
        { id: '507f1f77bcf86cd799439011' },
        { id: '507f1f77bcf86cd799439012' },
      ]
      assert.equal(typeof arrayData[0].id, 'string')
    })

    test('accepts numeric IDs (PostgreSQL)', () => {
      const arrayData: { id: number | string }[] = [{ id: 1 }, { id: 2 }]
      assert.equal(typeof arrayData[0].id, 'number')
    })
  })

  describe('block field IDs', () => {
    test('accepts string IDs (MongoDB)', () => {
      const blockData: { blockType: string; id: number | string }[] = [
        { id: '507f1f77bcf86cd799439011', blockType: 'hero' },
      ]
      assert.equal(typeof blockData[0].id, 'string')
    })

    test('accepts numeric IDs (PostgreSQL)', () => {
      const blockData: { blockType: string; id: number | string }[] = [
        { id: 42, blockType: 'hero' },
      ]
      assert.equal(typeof blockData[0].id, 'number')
    })
  })
})

/**
 * Regression tests for https://github.com/jhb-software/payload-plugins/issues/137
 *
 * "Translate empty fields" silently dropped translations for localized fields
 * inside groups and named tabs because the translated sub-object was created
 * via a `?? {}` fallback but never written back to its parent.
 */
describe('traverseFields - emptyOnly with missing target sub-objects (#137)', () => {
  test('populates a localized field inside a group when target locale data is missing', () => {
    const fields: Field[] = [
      {
        name: 'meta',
        type: 'group',
        fields: [{ name: 'title', type: 'text', localized: true }],
      },
    ]

    const translated = runTraverse(fields, { meta: { title: 'Hello' } }, true)

    assert.deepEqual(translated, { meta: { title: 'TRANSLATED:Hello' } })
  })

  test('populates a localized field inside a named tab when target locale data is missing', () => {
    const fields: Field[] = [
      {
        type: 'tabs',
        tabs: [
          {
            name: 'seo',
            fields: [{ name: 'description', type: 'text', localized: true }],
          },
        ],
      },
    ]

    const translated = runTraverse(fields, { seo: { description: 'World' } }, true)

    assert.deepEqual(translated, { seo: { description: 'TRANSLATED:World' } })
  })

  test('populates a localized field inside a group nested in a named tab', () => {
    const fields: Field[] = [
      {
        type: 'tabs',
        tabs: [
          {
            name: 'seo',
            fields: [
              {
                name: 'social',
                type: 'group',
                fields: [{ name: 'title', type: 'text', localized: true }],
              },
            ],
          },
        ],
      },
    ]

    const translated = runTraverse(fields, { seo: { social: { title: 'Nested' } } }, true)

    assert.deepEqual(translated, { seo: { social: { title: 'TRANSLATED:Nested' } } })
  })

  test('preserves existing translated values in a group when emptyOnly is true', () => {
    const fields: Field[] = [
      {
        name: 'meta',
        type: 'group',
        fields: [
          { name: 'title', type: 'text', localized: true },
          { name: 'description', type: 'text', localized: true },
        ],
      },
    ]

    const translatedData: Record<string, unknown> = {
      meta: { title: 'Already translated' },
    }
    const valuesToTranslate: ValueToTranslate[] = []

    traverseFields({
      dataFrom: { meta: { title: 'Hello', description: 'World' } },
      emptyOnly: true,
      fields,
      payloadConfig,
      translatedData,
      valuesToTranslate,
    })

    for (const v of valuesToTranslate) {
      v.onTranslate(`TRANSLATED:${v.value}`)
    }

    assert.deepEqual(translatedData, {
      meta: { title: 'Already translated', description: 'TRANSLATED:World' },
    })
  })
})
