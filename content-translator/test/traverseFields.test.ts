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
    const arrayFields: Field[] = [
      {
        name: 'items',
        type: 'array',
        localized: true,
        fields: [{ name: 'title', type: 'text' }],
      },
    ]

    test('translates array items keyed by string IDs (MongoDB)', () => {
      const translated = runTraverse(
        arrayFields,
        {
          items: [
            { id: '507f1f77bcf86cd799439011', title: 'One' },
            { id: '507f1f77bcf86cd799439012', title: 'Two' },
          ],
        },
        false,
      )

      const items = translated.items as Array<{ id: number | string; title: string }>
      assert.equal(items.length, 2)
      assert.equal(items[0].title, 'TRANSLATED:One')
      assert.equal(items[1].title, 'TRANSLATED:Two')
    })

    test('translates array items keyed by numeric IDs (PostgreSQL)', () => {
      const translated = runTraverse(
        arrayFields,
        {
          items: [
            { id: 1, title: 'One' },
            { id: 2, title: 'Two' },
          ],
        },
        false,
      )

      const items = translated.items as Array<{ id: number | string; title: string }>
      assert.equal(items.length, 2)
      assert.equal(items[0].title, 'TRANSLATED:One')
      assert.equal(items[1].title, 'TRANSLATED:Two')
    })
  })

  describe('block field IDs', () => {
    const blockFields: Field[] = [
      {
        name: 'layout',
        type: 'blocks',
        localized: true,
        blocks: [
          {
            slug: 'hero',
            fields: [{ name: 'headline', type: 'text' }],
          },
        ],
      } as unknown as Field,
    ]

    test('translates blocks keyed by string IDs (MongoDB)', () => {
      const translated = runTraverse(
        blockFields,
        {
          layout: [{ id: '507f1f77bcf86cd799439011', blockType: 'hero', headline: 'Welcome' }],
        },
        false,
      )

      const layout = translated.layout as Array<{ blockType: string; headline: string }>
      assert.equal(layout.length, 1)
      assert.equal(layout[0].blockType, 'hero')
      assert.equal(layout[0].headline, 'TRANSLATED:Welcome')
    })

    test('translates blocks keyed by numeric IDs (PostgreSQL)', () => {
      const translated = runTraverse(
        blockFields,
        {
          layout: [{ id: 42, blockType: 'hero', headline: 'Welcome' }],
        },
        false,
      )

      const layout = translated.layout as Array<{ blockType: string; headline: string }>
      assert.equal(layout.length, 1)
      assert.equal(layout[0].blockType, 'hero')
      assert.equal(layout[0].headline, 'TRANSLATED:Welcome')
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

describe('traverseFields - prototype pollution', () => {
  for (const unsafeName of ['__proto__', 'constructor', 'prototype']) {
    test(`ignores a field named "${unsafeName}" instead of writing to its key`, () => {
      const fields: Field[] = [
        { name: unsafeName, type: 'text', localized: true } as Field,
        { name: 'safe', type: 'text', localized: true } as Field,
      ]

      const translated = runTraverse(fields, { [unsafeName]: 'hostile', safe: 'hello' }, false)

      assert.equal(translated.safe, 'TRANSLATED:hello')
      assert.equal(Object.prototype.hasOwnProperty.call(translated, unsafeName), false)
      assert.equal(Object.getPrototypeOf(translated), Object.prototype)
      assert.equal(({} as Record<string, unknown>).hostile, undefined)
    })

    test(`ignores a named tab named "${unsafeName}"`, () => {
      const fields: Field[] = [
        {
          type: 'tabs',
          tabs: [
            { name: unsafeName, fields: [{ name: 'inner', type: 'text', localized: true }] },
            { name: 'safe', fields: [{ name: 'inner', type: 'text', localized: true }] },
          ],
        } as Field,
      ]

      const translated = runTraverse(
        fields,
        { [unsafeName]: { inner: 'hostile' }, safe: { inner: 'hello' } },
        false,
      )

      assert.deepEqual(translated.safe, { inner: 'TRANSLATED:hello' })
      assert.equal(Object.prototype.hasOwnProperty.call(translated, unsafeName), false)
      assert.equal(Object.getPrototypeOf(translated), Object.prototype)
    })
  }
})
