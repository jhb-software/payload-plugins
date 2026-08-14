import type { CollectionConfig, Config } from 'payload'

import { describe, expect, test } from 'vitest'

import type { IncomingPageCollectionConfig } from '../src/types/PageCollectionConfig.js'

import { payloadPagesPlugin } from '../src/plugin.js'

const pages = (
  page: IncomingPageCollectionConfig['page'],
  slug = 'topics',
): IncomingPageCollectionConfig => ({
  slug,
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text' }],
  page,
})

const rootPages: IncomingPageCollectionConfig = pages(
  { isRootCollection: true, parent: { collection: 'pages', name: 'parent' } },
  'pages',
)

const applyPlugin = (collections: CollectionConfig[]) =>
  payloadPagesPlugin({ generatePageURL: () => null })({ collections } as Config)

describe('parent collection validation at init', () => {
  test('accepts a collection nested under itself and under another page collection', () => {
    expect(() =>
      applyPlugin([
        rootPages,
        pages({ parent: { collection: ['pages', 'topics'], name: 'parent' } }),
      ] as CollectionConfig[]),
    ).not.toThrow()
  })

  test('rejects a parent collection that is not a page collection, naming both slugs', () => {
    expect(() =>
      applyPlugin([
        rootPages,
        pages({ parent: { collection: ['pages', 'authors'], name: 'parent' } }),
        { slug: 'authors', fields: [{ name: 'name', type: 'text' }] },
      ] as CollectionConfig[]),
    ).toThrow(/"topics" declares "authors" as a parent collection/)
  })

  test('rejects an unknown parent collection given as a plain slug, not just as a list', () => {
    expect(() =>
      applyPlugin([
        rootPages,
        pages({ parent: { collection: 'nowhere', name: 'parent' } }),
      ] as CollectionConfig[]),
    ).toThrow(/"nowhere" is not a page collection/)
  })

  test('rejects a shared parent document on a collection that also nests under itself', () => {
    expect(() =>
      applyPlugin([
        rootPages,
        pages({
          parent: { collection: ['pages', 'topics'], name: 'parent', sharedDocument: true },
        }),
      ] as CollectionConfig[]),
    ).toThrow(/cannot list its own slug/)
  })

  test('accepts a shared parent document across collections it does not belong to', () => {
    expect(() =>
      applyPlugin([
        rootPages,
        pages({ parent: { collection: ['pages'], name: 'parent', sharedDocument: true } }),
      ] as CollectionConfig[]),
    ).not.toThrow()
  })

  test('validates nothing when the plugin is disabled', () => {
    expect(() =>
      payloadPagesPlugin({ enabled: false, generatePageURL: () => null })({
        collections: [pages({ parent: { collection: 'nowhere', name: 'parent' } })],
      } as unknown as Config),
    ).not.toThrow()
  })
})
