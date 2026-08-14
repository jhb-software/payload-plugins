import { describe, expect, test } from 'vitest'

import {
  hasPolymorphicParent,
  parentCollections,
  resolveParentRef,
} from '../src/utils/parentRef.js'

const mono = { parent: { collection: 'pages' } }
const poly = { parent: { collection: ['pages', 'topics'] } }

describe('parentCollections', () => {
  test('wraps a single configured slug into a list', () => {
    expect(parentCollections(mono)).toEqual(['pages'])
  })

  test('returns the configured list unchanged', () => {
    expect(parentCollections(poly)).toEqual(['pages', 'topics'])
  })
})

describe('hasPolymorphicParent', () => {
  test('a single slug is monomorphic', () => {
    expect(hasPolymorphicParent(mono)).toBe(false)
  })

  test('a single-element array is polymorphic, because payload stores it that way', () => {
    expect(hasPolymorphicParent({ parent: { collection: ['pages'] } })).toBe(true)
  })
})

describe('resolveParentRef', () => {
  test('falls back to the configured collection for a bare id', () => {
    expect(resolveParentRef('abc', mono)).toEqual({ id: 'abc', collection: 'pages' })
  })

  test('resolves a numeric id, as stored by the SQL adapters', () => {
    expect(resolveParentRef(42, mono)).toEqual({ id: 42, collection: 'pages' })
  })

  test('resolves a populated document to its id', () => {
    expect(resolveParentRef({ id: 7, title: 'Shop' }, mono)).toEqual({
      id: 7,
      collection: 'pages',
    })
  })

  test('reads the collection from a polymorphic value rather than the config', () => {
    expect(resolveParentRef({ relationTo: 'topics', value: 3 }, poly)).toEqual({
      id: 3,
      collection: 'topics',
    })
  })

  test('resolves a polymorphic value whose relation was populated', () => {
    expect(
      resolveParentRef({ relationTo: 'topics', value: { id: 3, title: 'Mens' } }, poly),
    ).toEqual({ id: 3, collection: 'topics' })
  })

  test('is null when no parent is set', () => {
    expect(resolveParentRef(null, poly)).toBeNull()
    expect(resolveParentRef(undefined, poly)).toBeNull()
  })

  test('is null for a polymorphic value with no id, rather than pointing at a collection', () => {
    expect(resolveParentRef({ relationTo: 'topics', value: null }, poly)).toBeNull()
  })

  test('is null for a bare id on a polymorphic config, where the collection is unknowable', () => {
    expect(resolveParentRef(3, poly)).toBeNull()
  })
})
