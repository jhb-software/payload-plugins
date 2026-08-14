import type { Condition, Field, FilterOptionsProps, Where } from 'payload'

import { describe, expect, test } from 'vitest'

import type { IncomingPageCollectionConfig } from '../src/types/PageCollectionConfig.js'

import { createPageCollectionConfig } from '../src/collections/PageCollectionConfig.js'

const pluginConfig = { generatePageURL: () => null }

const buildPages = (page: Partial<IncomingPageCollectionConfig['page']> = {}) =>
  createPageCollectionConfig({
    collectionConfig: {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      fields: [{ name: 'title', type: 'text' }],
      page: {
        isRootCollection: true,
        parent: { collection: 'pages', name: 'parent' },
        ...page,
      },
    },
    pluginConfig,
  })

const fieldNamed = (fields: Field[], name: string) =>
  fields.find((field) => 'name' in field && field.name === name)!

const parentFilter = async (
  fields: Field[],
  data: Record<string, unknown>,
  relationTo = 'pages',
): Promise<boolean | undefined | Where> => {
  const { filterOptions } = fieldNamed(fields, 'parent') as { filterOptions: any }

  return typeof filterOptions === 'function'
    ? await filterOptions({ data, relationTo } as unknown as FilterOptionsProps)
    : filterOptions
}

const evaluateCondition = (condition: Condition | undefined, data: Record<string, unknown>) =>
  condition?.(data, {}, {} as Parameters<Condition>[2])

describe('createPageCollectionConfig field overrides', () => {
  test('generates the plugin defaults when no overrides are given', () => {
    const { fields } = buildPages()

    expect(fieldNamed(fields, 'path').admin).toMatchObject({
      components: { Field: '@jhb.software/payload-pages-plugin/client#PathField' },
      position: 'sidebar',
      readOnly: true,
    })
  })

  test('an admin override replaces one nested key and keeps the rest', () => {
    const { fields } = buildPages({
      parent: { collection: 'pages', name: 'parent' },
      path: { admin: { components: { Field: 'app#WrappedPathField' } } },
    })

    expect(fieldNamed(fields, 'path').admin).toMatchObject({
      components: { Field: 'app#WrappedPathField' },
      disableBulkEdit: true,
      position: 'sidebar',
      readOnly: true,
    })
  })

  test('the parent condition is ANDed with the plugin root-page condition', () => {
    const { fields } = buildPages({
      parent: {
        admin: { condition: (data) => !data?.systemRole },
        collection: 'pages',
        name: 'parent',
      },
    })

    const { condition } = fieldNamed(fields, 'parent').admin!

    expect(evaluateCondition(condition, {})).toBe(true)
    // Either half hides the field.
    expect(evaluateCondition(condition, { isRootPage: true })).toBe(false)
    expect(evaluateCondition(condition, { systemRole: 'not-found' })).toBe(false)
  })

  test('the parent filterOptions is ANDed with the plugin exclude-self filter', async () => {
    const categoryIndexOnly: Where = { systemRole: { equals: 'category-index' } }
    const { fields } = buildPages({
      parent: { collection: 'pages', filterOptions: () => categoryIndexOnly, name: 'parent' },
    })

    expect(await parentFilter(fields, { id: 7 })).toEqual({
      and: [{ id: { not_equals: 7 } }, categoryIndexOnly],
    })

    // On create there is no id yet, so the plugin filter drops out entirely.
    expect(await parentFilter(fields, {})).toEqual(categoryIndexOnly)
  })

  test('overrides reach the slug and breadcrumbs fields too', () => {
    const { fields } = buildPages({
      breadcrumbs: { admin: { hidden: true } },
      parent: { collection: 'pages', name: 'parent' },
      slug: { admin: { description: 'The URL segment.' } },
    })

    expect(fieldNamed(fields, 'breadcrumbs').admin).toMatchObject({
      hidden: true,
      position: 'sidebar',
    })
    expect(fieldNamed(fields, 'slug').admin).toMatchObject({
      description: 'The URL segment.',
      position: 'sidebar',
    })
  })

  test('overrides reach the isRootPage field of a root collection', () => {
    const { fields } = buildPages({
      isRootPage: { admin: { description: 'Only one page may be the root page.' } },
      parent: { collection: 'pages', name: 'parent' },
    })

    expect(fieldNamed(fields, 'isRootPage').admin).toMatchObject({
      components: {
        Field: { path: '@jhb.software/payload-pages-plugin/server#IsRootPageField' },
      },
      description: 'Only one page may be the root page.',
      position: 'sidebar',
    })
  })

  test('overrides are kept out of custom.pageConfig, which is serialized to the client', () => {
    const config = buildPages({
      parent: {
        admin: { condition: () => true },
        collection: 'pages',
        filterOptions: () => true,
        name: 'parent',
      },
    })

    expect(config.custom!.pageConfig.parent).toEqual({
      collection: 'pages',
      name: 'parent',
      sharedDocument: false,
    })
  })
})

describe('createPageCollectionConfig polymorphic parent', () => {
  const buildPolymorphic = () =>
    createPageCollectionConfig({
      collectionConfig: {
        slug: 'topics',
        admin: { useAsTitle: 'title' },
        fields: [{ name: 'title', type: 'text' }],
        page: { parent: { collection: ['pages', 'topics'], name: 'parent' } },
      },
      pluginConfig,
    })

  test('the parent field relates to every configured collection', () => {
    const { fields } = buildPolymorphic()

    expect((fieldNamed(fields, 'parent') as { relationTo: unknown }).relationTo).toEqual([
      'pages',
      'topics',
    ])
  })

  test('the exclude-self filter applies to the own collection only', async () => {
    const { fields } = buildPolymorphic()

    expect(await parentFilter(fields, { id: 7 }, 'topics')).toEqual({ id: { not_equals: 7 } })
  })

  test('a document is not excluded from another collection sharing its serial id', async () => {
    const { fields } = buildPolymorphic()

    expect(await parentFilter(fields, { id: 7 }, 'pages')).toBe(true)
  })
})
