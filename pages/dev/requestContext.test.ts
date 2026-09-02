import payload from 'payload'
import { createLocalReq } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import config from './src/payload.config'
import type { Config } from 'payload/generated-types'
import { instrumentDbOps, type DbOpsInstrumentation } from './src/test/dbOps'
import { deleteAllCollections, deleteCollection } from './src/test/deleteCollections'
import { COUNT_PAGES_DURING_READ_HEADER } from './src/test/nestedCount'
import {
  clearPathChangeRecords,
  recordedPathChangeErrors,
  recordedPathChanges,
} from './src/test/pathChangesCapture'

/**
 * These tests pin the behaviour of reads that share a single `PayloadRequest`.
 *
 * Payload passes the same request object into every nested local API call, and the plugin
 * carries per-operation decisions (whether virtual fields are wanted, whether drafts are
 * resolved) on `req.context`. A request outlives an operation, so state written for one read
 * must never decide the outcome of the next one — neither the ancestors a draft read resolves
 * nor the work a selective read performs.
 *
 * Not covered, and not coverable: two reads of one collection running concurrently in different
 * draft modes, including a user `beforeRead` hook on a multi-document `find` that runs a nested
 * read with a draft mode of its own. Payload hands them the same `req.context` and gives
 * `beforeRead` no `draft` of its own (https://github.com/payloadcms/payload/issues/16180), so one
 * overwrites the other's draft mode before its ancestor walk starts, and nothing storable on the
 * context distinguishes them. Reads that follow one another, and operations nested inside one
 * another, are covered here and in `dev_multi_tenant/localeRouting.test.ts`.
 */

type DefaultIDType = Config['db']['defaultIDType']

const virtualFields = {
  breadcrumbs: [],
  meta: { alternatePaths: [] },
  path: '',
}

let dbOps: DbOpsInstrumentation

beforeAll(async () => {
  await payload.init({ config })
  dbOps = instrumentDbOps(payload.db)
  await deleteAllCollections(config, ['users'])
})

afterAll(async () => {
  await deleteAllCollections(config)

  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

beforeEach(async () => {
  await deleteCollection('authors')
  await deleteCollection('pages')
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

/**
 * Seeds root -> parent -> child, where `parent` has an unpublished draft that renames it.
 * The published path of `child` is `/de/parent/child`, its draft path `/de/parent-draft/child`.
 */
const seedRenamedParent = async () => {
  const root = await createPage({ title: 'Root', slug: '', isRootPage: true })
  const parent = await createPage({ title: 'Parent', slug: 'parent', parent: root.id })
  const child = await createPage({ title: 'Child', slug: 'child', parent: parent.id })

  await payload.update({
    collection: 'pages',
    id: parent.id,
    locale: 'de',
    draft: true,
    data: { slug: 'parent-draft', _status: 'draft' as const },
  })

  return { child, parent, root }
}

describe('draft resolution of ancestors on a shared request', () => {
  test('resolves the published ancestor for a published read that follows a draft read on the same request', async () => {
    const { child } = await seedRenamedParent()
    const req = await createLocalReq({}, payload)

    const draftDoc = await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: true,
      locale: 'de',
      req,
    })
    const publishedDoc = await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: false,
      locale: 'de',
      req,
    })

    expect(draftDoc.path).toBe('/de/parent-draft/child')
    expect(publishedDoc.path).toBe('/de/parent/child')
  })

  test('resolves the draft ancestor for a draft read that follows a published read on the same request', async () => {
    const { child } = await seedRenamedParent()
    const req = await createLocalReq({}, payload)

    const publishedDoc = await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: false,
      locale: 'de',
      req,
    })
    const draftDoc = await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: true,
      locale: 'de',
      req,
    })

    expect(publishedDoc.path).toBe('/de/parent/child')
    expect(draftDoc.path).toBe('/de/parent-draft/child')
  })

  test('reports the published path of a document deleted on a request that earlier read a draft', async () => {
    const { child } = await seedRenamedParent()
    const req = await createLocalReq({}, payload)

    // a preview of the draft subtree, rendered before the document is removed
    await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: true,
      locale: 'de',
      req,
    })

    clearPathChangeRecords()
    await payload.delete({ collection: 'pages', id: child.id, req })

    // the URL that has to be purged is the live one, not the one the preview showed
    expect(recordedPathChangeErrors()).toEqual([])
    expect(recordedPathChanges()).toEqual([
      expect.objectContaining({
        collection: 'pages',
        id: child.id,
        locale: 'de',
        previousPath: '/de/parent/child',
        path: null,
      }),
    ])
  })

  test('resolves the draft ancestors of a read whose hook counts a page collection with the same request', async () => {
    const { child } = await seedRenamedParent()
    const req = await createLocalReq({}, payload)
    req.headers = new Headers({ [COUNT_PAGES_DURING_READ_HEADER]: 'true' })

    // the `beforeRead` hook counts `pages` with this request — an operation which carries no
    // draft mode of its own and must not impose one on the read it runs inside
    const doc = await payload.findByID({
      collection: 'pages',
      id: child.id,
      depth: 0,
      draft: true,
      locale: 'de',
      req,
    })

    expect(doc.path).toBe('/de/parent-draft/child')
  })
})

describe('virtual field generation on a shared request', () => {
  test('walks no ancestor for a selective read of another collection on the same request', async () => {
    const root = await createPage({ title: 'Root', slug: '', isRootPage: true })
    const a = await createPage({ title: 'A', slug: 'a', parent: root.id })
    const page = await createPage({ title: 'Page', slug: 'page', parent: a.id })
    const authorsParent = await createPage({ title: 'Autoren', slug: 'autoren', parent: root.id })
    const author = await payload.create({
      collection: 'authors',
      locale: 'de',
      data: {
        name: 'Max Mustermann',
        content: 'Bio',
        slug: 'max-mustermann',
        parent: authorsParent.id,
        ...virtualFields,
      },
    })

    const req = await createLocalReq({}, payload)

    // this read asks for the virtual fields, so it walks the ancestors of `page` — as it should
    await payload.findByID({ collection: 'pages', id: page.id, depth: 0, locale: 'de', req })

    dbOps.start()
    await payload.findByID({
      collection: 'authors',
      id: author.id,
      depth: 0,
      locale: 'de',
      req,
      // `slug` and `parent` are selected so a decision leaking from the `pages` read finds
      // everything it needs to start walking, instead of stopping at a missing field. The
      // author's parent branch was not visited by that read, so nothing it cached answers
      // the walk.
      select: { slug: true, parent: true, name: true },
    })
    const ops = dbOps.stop()

    // the caller asked for three stored fields of an author — no virtual field is wanted, so the
    // ancestor collection is never queried, whatever an earlier read asked for
    expect(ops.filter((op) => op.collection === 'pages')).toEqual([])
  })
})
