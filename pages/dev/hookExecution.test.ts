import payload from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import config from './src/payload.config'
import type { Config } from 'payload/generated-types'
import { deleteAllCollections, deleteCollection } from './src/test/deleteCollections'
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

describe('database reads caused by an ancestor walk that crosses collections', () => {
  /**
   * Counts `payload.db.find` calls per collection while running `fn`.
   *
   * The ancestor walk batches by collection, so a chain alternating between `pages` and
   * `topics` splits each level into two queries. What must not change is that the count stays
   * proportional to the depth of the tree rather than to the number of documents read.
   */
  const countDbFinds = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const db = payload.db as any
    const original = db.find.bind(db)
    let count = 0
    db.find = (...args: unknown[]) => {
      count++
      return original(...args)
    }

    try {
      return [await fn(), count]
    } finally {
      db.find = original
    }
  }

  beforeEach(async () => {
    await deleteCollection('topics')
    await deleteCollection('pages')
  })

  test('reading a list of topics costs the same number of queries as reading one', async () => {
    const root = await createPage({ title: 'Root', slug: '', isRootPage: true })
    const shop = await createPage({ title: 'Shop', slug: 'shop', parent: root.id })

    const createTopic = async (title: string, slug: string, parent: any) =>
      await payload.create({
        collection: 'topics',
        locale: 'de',
        data: { ...virtualFields, title, slug, parent, _status: 'published' } as any,
      })

    // A chain which alternates collections at every level: pages -> topics -> topics.
    const mens = await createTopic('Mens', 'mens', { relationTo: 'pages', value: shop.id })

    // Twenty siblings sharing that chain.
    for (let i = 0; i < 20; i++) {
      await createTopic(`Shirt ${i}`, `shirt-${i}`, { relationTo: 'topics', value: mens.id })
    }

    const [single, singleQueries] = await countDbFinds(() =>
      payload.find({
        collection: 'topics',
        locale: 'de',
        depth: 0,
        limit: 1,
        where: { slug: { equals: 'shirt-0' } },
      }),
    )
    expect(single.docs[0].path).toBe('/de/shop/mens/shirt-0')

    const [list, listQueries] = await countDbFinds(() =>
      payload.find({
        collection: 'topics',
        locale: 'de',
        depth: 0,
        limit: 0,
        where: { slug: { not_equals: 'mens' } },
      }),
    )
    expect(list.docs).toHaveLength(20)

    // Batching means the twenty siblings share the ancestor loads, so the list costs no more
    // ancestor queries than the single read. Without it, each document would walk on its own.
    expect(listQueries).toBeLessThanOrEqual(singleQueries)
  })
})
