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
 * These tests pin the cost that virtual `path` / `breadcrumbs` generation is allowed to add to
 * a read.
 *
 * To build the path of a nested page, the plugin walks up the parent chain. That walk reads
 * ancestors straight from the database adapter and selects only the fields the path is built
 * from, so it never enters the ancestor collections' hook chain: a user-defined `afterRead`
 * hook (signing image URLs, calling an external API, computing derived data) runs exactly once
 * for the document the caller asked for and ZERO times per ancestor, no matter how deep the
 * page tree is or how many documents a list query returns.
 *
 * Every ancestor count below is therefore 0, and only the requested documents run hooks.
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
  test("does not execute the parent collection's afterRead hook for any ancestor when generating the path", async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    const doc = await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the requested document is read once, as the caller expects
    expect(doc.path).toBe('/de/a/b/c')
    expect(collectionAfterReadCount(c.id)).toBe(1)

    // ...and none of the three ancestors runs the collection's afterRead hook, even though
    // all of them are needed to build the path
    expect(collectionAfterReadCount(b.id)).toBe(0)
    expect(collectionAfterReadCount(a.id)).toBe(0)
    expect(collectionAfterReadCount(root.id)).toBe(0)
  })

  test('keeps ancestor afterRead hooks unexecuted across repeated reads of the same document', async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })
    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the ancestor cache lives on `req.context` and therefore does not survive between reads,
    // but the walk itself runs no hooks, so a repeated read costs nothing in hook executions
    expect(collectionAfterReadCount(c.id)).toBe(2)
    expect(collectionAfterReadCount(b.id)).toBe(0)
    expect(collectionAfterReadCount(a.id)).toBe(0)
    expect(collectionAfterReadCount(root.id)).toBe(0)
  })

  test('runs no ancestor afterRead hook for a list of sibling pages', async () => {
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

    // no ancestor of the six siblings runs a hook — neither once per sibling nor once in total
    expect(collectionAfterReadCount(b.id)).toBe(0)
    expect(collectionAfterReadCount(a.id)).toBe(0)
    expect(collectionAfterReadCount(root.id)).toBe(0)
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
    // walked at all — the same hook cost the walking reads above now have
    expect(doc.path).toBeUndefined()
    expect(collectionAfterReadCount(c.id)).toBe(1)
    expect(collectionAfterReadCount(b.id)).toBe(0)
    expect(collectionAfterReadCount(a.id)).toBe(0)
    expect(collectionAfterReadCount(root.id)).toBe(0)
  })

  test('runs no field-level afterRead hook of an ancestor, not even for the fields the walk reads', async () => {
    const { a, b, c, root } = await seedChain()
    resetHookExecutionCounts()

    await payload.findByID({ collection: 'pages', id: c.id, depth: 0, locale: 'de' })

    // the requested document runs its field hooks once, for every field
    expect(fieldAfterReadCount('title', c.id)).toBe(1)
    expect(fieldAfterReadCount('content', c.id)).toBe(1)

    // `title` is the breadcrumb label field, so the walk reads it for every ancestor — but it
    // reads it from the database adapter, which never runs field hooks
    expect(fieldAfterReadCount('title', b.id)).toBe(0)
    expect(fieldAfterReadCount('title', a.id)).toBe(0)
    expect(fieldAfterReadCount('title', root.id)).toBe(0)

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
