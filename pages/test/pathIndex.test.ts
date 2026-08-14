import { describe, expect, test } from 'vitest'

import { isPageCollectionConfig } from '../src/utils/pageCollectionConfigHelpers.js'
import { assembleDescendantPaths, type DescendantRow } from '../src/utils/loadDescendants.js'

describe('isPageCollectionConfig', () => {
  const base = { slug: 'articles', fields: [] }

  test('identifies a page collection', () => {
    expect(
      isPageCollectionConfig({
        ...base,
        page: { parent: { collection: 'pages', name: 'parent' } },
      } as any),
    ).toBe(true)
  })

  test('ignores a collection without a page property', () => {
    expect(isPageCollectionConfig(base as any)).toBe(false)
  })

  test('ignores a collection carrying an unrelated page property that is not a page config', () => {
    expect(isPageCollectionConfig({ ...base, page: { hero: true } } as any)).toBe(false)
    expect(isPageCollectionConfig({ ...base, page: null } as any)).toBe(false)
    expect(isPageCollectionConfig({ ...base, page: 'landing' } as any)).toBe(false)
  })
})

describe('assembleDescendantPaths', () => {
  const root = { collection: 'pages', id: 1 }

  test('assembles nested descendant paths by prefix substitution', () => {
    const rows: DescendantRow[] = [
      { collection: 'pages', id: 2, live: true, parent: root, slug: 'child' },
      {
        collection: 'pages',
        id: 3,
        live: true,
        parent: { collection: 'pages', id: 2 },
        slug: 'grandchild',
      },
    ]

    expect(assembleDescendantPaths({ '': '/base' }, root, rows)).toEqual([
      { collection: 'pages', id: 2, live: true, paths: { '': '/base/child' } },
      { collection: 'pages', id: 3, live: true, paths: { '': '/base/child/grandchild' } },
    ])
  })

  test('follows chains crossing collections', () => {
    const rows: DescendantRow[] = [
      { collection: 'topics', id: 't1', live: true, parent: root, slug: 'topic' },
      {
        collection: 'announcements',
        id: 'a1',
        live: false,
        parent: { collection: 'topics', id: 't1' },
        slug: 'news',
      },
    ]

    expect(assembleDescendantPaths({ '': '/base' }, root, rows)).toEqual([
      { collection: 'topics', id: 't1', live: true, paths: { '': '/base/topic' } },
      { collection: 'announcements', id: 'a1', live: false, paths: { '': '/base/topic/news' } },
    ])
  })

  test('builds per-locale paths and drops locales whose slug or base path is missing', () => {
    const rows: DescendantRow[] = [
      {
        collection: 'pages',
        id: 2,
        live: true,
        parent: root,
        slug: { de: 'kind', en: 'child' },
      },
      {
        collection: 'pages',
        id: 3,
        live: true,
        parent: { collection: 'pages', id: 2 },
        // no English slug: no English path, at any depth below either
        slug: { de: 'enkel' },
      },
      {
        collection: 'pages',
        id: 4,
        live: true,
        parent: { collection: 'pages', id: 3 },
        slug: { de: 'urenkel', en: 'great-grandchild' },
      },
    ]

    expect(assembleDescendantPaths({ de: '/de/basis', en: '/en/base' }, root, rows)).toEqual([
      {
        collection: 'pages',
        id: 2,
        live: true,
        paths: { de: '/de/basis/kind', en: '/en/base/child' },
      },
      { collection: 'pages', id: 3, live: true, paths: { de: '/de/basis/kind/enkel' } },
      { collection: 'pages', id: 4, live: true, paths: { de: '/de/basis/kind/enkel/urenkel' } },
    ])
  })
})
