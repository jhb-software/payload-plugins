import payload, { CollectionSlug, SanitizedConfig } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import config from './src/payload.config'
import type { Config } from 'payload/generated-types'
import {
  collectionAfterReadCount,
  fieldAfterReadCount,
  resetHookExecutionCounts,
} from './src/test/hookExecutionCounter'

/**
 * These tests document a hidden cost of the virtual `path` / `breadcrumbs` generation.
 *
 * To build the path of a nested page, the `beforeRead` hook walks up the parent chain and
 * loads every ancestor through a full `payload.findByID` Local API call. A full Local API
 * call runs the parent collection's ENTIRE hook chain, so every user-defined `afterRead`
 * hook on the page collection runs once more per ancestor — for documents the caller never
 * asked for. A user hook that signs image URLs, calls an external API or computes derived
 * data therefore gets silently multiplied by the depth of the page tree on every read.
 *
 * The assertions below pin the CURRENT counts, so they describe the problem rather than the
 * desired end state. A future lean ancestor walk (loading only the fields the path needs,
 * bypassing the hook chain) should drive every ancestor count to 0; when that lands, the
 * expected ancestor counts in this file are meant to be updated to 0 and the leaf/requested
 * document counts left unchanged.
 *
 * All reads use `depth: 0` on purpose. At Payload's default `depth: 2` the `parent`
 * relationship is additionally populated, which runs the same hooks again for reasons that
 * have nothing to do with this plugin; `depth: 0` isolates the cost caused by the ancestor
 * walk itself.
 */

type DefaultIDType = Config['db']['defaultIDType']

const virtualFields = {
  breadcrumbs: [],
  meta: { alternatePaths: [] },
  path: '',
}

beforeAll(async () => {
  await payload.init({ config })
  await deleteAllCollections(config, ['users'])
})

afterAll(async () => {
  await deleteAllCollections(config)

  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

beforeEach(async () => {
  await deleteCollection('pages')
  resetHookExecutionCounts()
})

const createPage = async (data: {
  title: string
  slug: string
  parent?: DefaultIDType
  isRootPage?: boolean
}) =>
  await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      content: data.title,
      _status: 'published' as const,
      ...data,
      ...virtualFields,
    },
  })

/** Seeds the page chain root -> a -> b -> c, so that `c` has three ancestors. */
const seedChain = async () => {
  const root = await createPage({ title: 'Root', slug: '', isRootPage: true })
  const a = await createPage({ title: 'A', slug: 'a', parent: root.id })
  const b = await createPage({ title: 'B', slug: 'b', parent: a.id })
  const c = await createPage({ title: 'C', slug: 'c', parent: b.id })
  return { a, b, c, root }
}

describe('afterRead hook executions caused by the ancestor walk', () => {
  test("executes the parent collection's afterRead hook for every distinct ancestor when generating the path", async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    const doc = await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the requested document is read once, as the caller expects
    expect(doc.path).toBe('/de/a/b/c')
    expect(collectionAfterReadCount(c.id)).toBe(1)

    // ...but each of the three ancestors is read as well, running the collection's
    // afterRead hook for documents the caller never requested
    expect(collectionAfterReadCount(b.id)).toBe(1)
    expect(collectionAfterReadCount(a.id)).toBe(1)
    expect(collectionAfterReadCount(root.id)).toBe(1)
  })

  test('runs the ancestor afterRead hooks again on every separate read because the ancestor cache is request-scoped', async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })
    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the promise cache in findByIDCached lives on `req.context`, so it dedupes within a
    // single operation only — a second read pays the full ancestor cost again
    expect(collectionAfterReadCount(b.id)).toBe(2)
    expect(collectionAfterReadCount(a.id)).toBe(2)
    expect(collectionAfterReadCount(root.id)).toBe(2)
  })

  test('runs the ancestor afterRead hooks once per distinct ancestor for a list of sibling pages', async () => {
    const { a, b, c, root } = await seedChain()
    const siblings = [c]
    for (let index = 0; index < 5; index++) {
      siblings.push(
        await createPage({ title: `Leaf ${index}`, slug: `leaf-${index}`, parent: b.id }),
      )
    }
    resetHookExecutionCounts()

    const result = await payload.find({
      collection: 'pages',
      depth: 0,
      locale: 'de',
      where: { parent: { equals: b.id } },
    })

    expect(result.docs).toHaveLength(siblings.length)
    for (const sibling of siblings) {
      expect(collectionAfterReadCount(sibling.id)).toBe(1)
    }

    // the request-scoped promise cache collapses the six identical parent chains, so each
    // distinct ancestor is read once rather than once per sibling — the amplification is
    // bounded by tree depth here, not by page size
    expect(collectionAfterReadCount(b.id)).toBe(1)
    expect(collectionAfterReadCount(a.id)).toBe(1)
    expect(collectionAfterReadCount(root.id)).toBe(1)
  })

  test('does not touch any ancestor when the query selects no virtual field', async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    const doc = await payload.findByID({
      collection: 'pages',
      id: c.id,
      depth: 0,
      locale: 'de',
      select: { title: true },
    })

    // without a virtual field in the select there is no path to generate, so no ancestor is
    // walked — this is the baseline the ancestor counts above should eventually match
    expect(doc.path).toBeUndefined()
    expect(collectionAfterReadCount(c.id)).toBe(1)
    expect(collectionAfterReadCount(b.id)).toBe(0)
    expect(collectionAfterReadCount(a.id)).toBe(0)
    expect(collectionAfterReadCount(root.id)).toBe(0)
  })

  test('runs field-level afterRead hooks of ancestors only for the fields the ancestor walk selects', async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the requested document runs its field hooks once, for every field
    expect(fieldAfterReadCount('title', c.id)).toBe(1)
    expect(fieldAfterReadCount('content', c.id)).toBe(1)

    // `title` is the breadcrumb label field, so the ancestor walk selects it and its
    // field-level hook runs for every ancestor as well
    expect(fieldAfterReadCount('title', b.id)).toBe(1)
    expect(fieldAfterReadCount('title', a.id)).toBe(1)
    expect(fieldAfterReadCount('title', root.id)).toBe(1)

    // fields outside that select are stripped before the field hooks run, which keeps the
    // amplification off unrelated fields — only fields the walk happens to need pay the cost
    expect(fieldAfterReadCount('content', b.id)).toBe(0)
    expect(fieldAfterReadCount('content', a.id)).toBe(0)
    expect(fieldAfterReadCount('content', root.id)).toBe(0)
  })
})

const deleteCollection = async (collection: CollectionSlug) => {
  // use db.deleteMany instead of payload.delete to avoid running hooks
  await payload.db.deleteMany({ collection, where: {} })

  // this will fail for collections which have no versions enabled, therefore wrapped in a try catch
  try {
    await payload.db.deleteVersions({ collection, where: {} })
  } catch {}
}

/**
 * Deletion order for collections to respect foreign key constraints.
 * Collections are deleted in this order: children before parents.
 */
const COLLECTION_DELETION_ORDER: CollectionSlug[] = [
  'country-travel-tips',
  'blogposts',
  'authors',
  'countries',
  'pages',
  'blogpost-categories',
  'redirects',
]

const deleteAllCollections = async (
  config: Promise<SanitizedConfig>,
  except: CollectionSlug[] = [],
) => {
  const collections = (await config).collections?.filter((c) => !except.includes(c.slug)) ?? []
  const collectionSlugs = new Set(collections.map((c) => c.slug))

  for (const slug of COLLECTION_DELETION_ORDER) {
    if (collectionSlugs.has(slug)) {
      await deleteCollection(slug)
      collectionSlugs.delete(slug)
    }
  }

  for (const slug of Array.from(collectionSlugs)) {
    await deleteCollection(slug)
  }
}
