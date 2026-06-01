import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ValueToTranslate } from '../src/translate/types.ts'

import { applyTranslations } from '../src/translate/applyTranslations.ts'

const collect = (
  values: string[],
): { results: string[]; valuesToTranslate: ValueToTranslate[] } => {
  const results: string[] = []
  const valuesToTranslate: ValueToTranslate[] = values.map((value, index) => ({
    onTranslate: (translated) => {
      results[index] = translated
    },
    value,
  }))
  return { results, valuesToTranslate }
}

describe('applyTranslations', () => {
  test('refuses to apply a result whose length does not match the requested texts', () => {
    const { valuesToTranslate } = collect(['a', 'b', 'c'])

    assert.throws(
      () => applyTranslations(valuesToTranslate, ['only', 'two']),
      /returned 2 texts for 3 source texts/,
    )
  })

  test('applies each translation to its matching value and decodes HTML entities', () => {
    const { results, valuesToTranslate } = collect(['x', 'y'])

    applyTranslations(valuesToTranslate, ['Caf&eacute;', 'A &amp; B'])

    assert.deepEqual(results, ['Café', 'A & B'])
  })
})
