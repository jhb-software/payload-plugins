/**
 * Performance investigation benchmark for virtual path/breadcrumb generation.
 *
 * Uses the shared DB instrumentation (`src/test/dbOps.ts`) to:
 *  1. count DB operations per scenario (with method/collection/select breakdown)
 *  2. inject simulated network latency per DB round trip (SIMULATED_LATENCY_MS)
 *
 * Not part of the regular test suite — opt in explicitly with:
 *   cross-env RUN_PERF_BENCH=1 PAYLOAD_DATABASE=sqlite vitest run perf-bench
 *
 * Results are written to ./bench-results.txt (override with BENCH_OUT).
 * Set BENCH_VERBOSE=1 to log every DB operation with its where clause.
 */
import fs from 'fs'
import payload, { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, test } from 'vitest'
import config from './src/payload.config'
import { findPageByPath } from '@jhb.software/payload-pages-plugin'
import { instrumentDbOps, type DbOpsInstrumentation } from './src/test/dbOps'

const OUT_FILE = process.env.BENCH_OUT ?? './bench-results.txt'
const outLines: string[] = []
function report(line: string) {
  outLines.push(line)
  console.log(line)
}

const SIMULATED_LATENCY_MS = 8

let dbOps: DbOpsInstrumentation

async function scenario<T>(name: string, fn: () => Promise<T>): Promise<T> {
  dbOps.start()
  const start = performance.now()
  const result = await fn()
  const elapsed = performance.now() - start
  const ops = dbOps.stop()

  const byKind = new Map<string, number>()
  for (const op of ops) {
    const key = `${op.method}(${op.collection ?? '?'})${op.select ? ` select=${op.select}` : ''}`
    byKind.set(key, (byKind.get(key) ?? 0) + 1)
  }
  report(`\n=== ${name} ===`)
  report(
    `DB ops: ${ops.length}  |  tx begin/commit: ${dbOps.txOps()}  |  wall time @${SIMULATED_LATENCY_MS}ms simulated latency: ${elapsed.toFixed(0)}ms`,
  )
  for (const [kind, count] of byKind) {
    report(`  ${count}x ${kind}`)
  }
  if (process.env.BENCH_VERBOSE) {
    for (const op of ops) {
      report(`    ${op.method}(${op.collection}) where=${op.where} select=${op.select}`)
    }
  }
  return result
}

/** Empty virtual fields to satisfy TypeScript when creating documents. */
const virtualFields = {
  breadcrumbs: [],
  meta: { alternatePaths: [] },
  path: '',
}

const ids: Record<string, string | number> = {}

async function createPage(
  key: string,
  data: { slugDe: string; slugEn: string; title: string; parent?: string; isRootPage?: boolean },
) {
  const doc = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      title: `${data.title} DE`,
      content: 'content',
      slug: data.slugDe,
      isRootPage: data.isRootPage ?? false,
      parent: data.parent ? (ids[data.parent] as any) : undefined,
      _status: 'published',
      ...virtualFields,
    } as any,
  })
  ids[key] = doc.id
  await payload.update({
    collection: 'pages',
    id: doc.id,
    locale: 'en',
    data: { title: `${data.title} EN`, content: 'content', slug: data.slugEn } as any,
  })
  return doc.id
}

/**
 * Creates a topic, whose parent may live in `pages` or in `topics` — the chains below therefore
 * alternate between two collections, which the ancestor walk has to batch per collection.
 */
async function createTopic(
  key: string,
  data: {
    parent: { collection: 'pages' | 'topics'; key: string }
    slugDe: string
    slugEn: string
    title: string
  },
) {
  const doc = await payload.create({
    collection: 'topics',
    locale: 'de',
    data: {
      title: `${data.title} DE`,
      slug: data.slugDe,
      parent: { relationTo: data.parent.collection, value: ids[data.parent.key] },
      _status: 'published',
      ...virtualFields,
    } as any,
  })
  ids[key] = doc.id
  await payload.update({
    collection: 'topics',
    id: doc.id,
    locale: 'en',
    data: { title: `${data.title} EN`, slug: data.slugEn } as any,
  })
  return doc.id
}

const enabled = process.env.RUN_PERF_BENCH === '1'

beforeAll(async () => {
  if (!enabled) return
  await payload.init({ config })

  // reset all page docs from previous runs (topics first, they reference pages)
  await payload.db.deleteMany({ collection: 'topics', where: {} })
  await payload.db.deleteMany({ collection: 'pages', where: {} })
  // and the path cache, so the cache-miss scenario is a real miss (sqlite reuses row ids,
  // so an entry from a previous run can otherwise still resolve)
  for (const key of await payload.kv.keys()) {
    await payload.kv.delete(key)
  }
  for (const collection of ['pages', 'topics']) {
    try {
      await (payload.db as any).deleteVersions({ collection, where: {} })
    } catch {}
  }

  // Seed BEFORE instrumenting, so seeding cost is excluded.
  // Tree:
  //   root
  //   ├── services ── web ── seo ── audit          (chain, depth 4)
  //   └── s1..s4 ── each with c1..c5               (breadth: 4 sections x 5 children)
  await createPage('root', { slugDe: '', slugEn: '', title: 'Root', isRootPage: true })
  await createPage('services', {
    slugDe: 'leistungen',
    slugEn: 'services',
    title: 'Services',
    parent: 'root',
  })
  await createPage('web', { slugDe: 'web', slugEn: 'web', title: 'Web', parent: 'services' })
  await createPage('seo', { slugDe: 'seo', slugEn: 'seo', title: 'SEO', parent: 'web' })
  await createPage('audit', { slugDe: 'audit', slugEn: 'audit', title: 'Audit', parent: 'seo' })

  for (let s = 1; s <= 4; s++) {
    await createPage(`s${s}`, {
      slugDe: `bereich-${s}`,
      slugEn: `section-${s}`,
      title: `Section ${s}`,
      parent: 'root',
    })
    for (let c = 1; c <= 5; c++) {
      await createPage(`s${s}c${c}`, {
        slugDe: `thema-${s}-${c}`,
        slugEn: `topic-${s}-${c}`,
        title: `Topic ${s}.${c}`,
        parent: `s${s}`,
      })
    }
  }

  // Cross-collection subtree, hanging off the page tree above:
  //   pages:s1 ── topics:shop ── topics:mens ── m1..m5
  await createTopic('shop', {
    slugDe: 'shop',
    slugEn: 'shop',
    title: 'Shop',
    parent: { collection: 'pages', key: 's1' },
  })
  await createTopic('mens', {
    slugDe: 'herren',
    slugEn: 'mens',
    title: 'Mens',
    parent: { collection: 'topics', key: 'shop' },
  })
  for (let c = 1; c <= 5; c++) {
    await createTopic(`m${c}`, {
      slugDe: `hemd-${c}`,
      slugEn: `shirt-${c}`,
      title: `Shirt ${c}`,
      parent: { collection: 'topics', key: 'mens' },
    })
  }

  dbOps = instrumentDbOps(payload.db, { latencyMs: SIMULATED_LATENCY_MS })
}, 240_000)

afterAll(async () => {
  if (!enabled) return
  fs.writeFileSync(OUT_FILE, outLines.join('\n') + '\n')
  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

describe.skipIf(!enabled)('virtual path generation DB cost', () => {
  test('scenarios', async () => {
    // 1. Single doc, deep chain
    await scenario('findByID leaf at depth 4, locale=de (all fields)', () =>
      payload.findByID({ collection: 'pages', id: ids.audit, locale: 'de' }),
    )

    // 2. Single doc, no virtual fields selected
    await scenario('findByID leaf at depth 4, select={title} (no virtual fields)', () =>
      payload.findByID({
        collection: 'pages',
        id: ids.audit,
        locale: 'de',
        select: { title: true },
      }),
    )

    // 3. Single doc, only path selected
    await scenario('findByID leaf at depth 4, select={path}', () =>
      payload.findByID({
        collection: 'pages',
        id: ids.audit,
        locale: 'de',
        select: { path: true },
      }),
    )

    // 4. Sitemap: all pages, select path only
    await scenario('find ALL pages (29 docs), select={path,slug} [sitemap]', () =>
      payload.find({
        collection: 'pages',
        locale: 'de',
        limit: 200,
        pagination: false,
        select: { path: true, slug: true },
      }),
    )

    // 5. Admin list view: all pages, all fields
    await scenario('find ALL pages (29 docs), all fields [admin list]', () =>
      payload.find({ collection: 'pages', locale: 'de', limit: 200, pagination: false }),
    )

    // 6. Children of one section (navigation)
    await scenario('find children of section s1 (5 docs, same parent) [nav]', () =>
      payload.find({
        collection: 'pages',
        locale: 'de',
        where: { parent: { equals: ids.s1 } },
        select: { path: true, title: true },
      }),
    )

    // 7. findPageByPath cold + warm
    await scenario('findPageByPath /de/leistungen/web/seo/audit (cache MISS)', () =>
      findPageByPath({ payload, path: '/de/leistungen/web/seo/audit', cache: true }),
    )
    await scenario('findPageByPath /de/leistungen/web/seo/audit (cache HIT)', () =>
      findPageByPath({ payload, path: '/de/leistungen/web/seo/audit', cache: true }),
    )

    // 8. findPageByPath 404
    await scenario('findPageByPath /de/does/not/exist (404)', () =>
      findPageByPath({ payload, path: '/de/does/not/exist', cache: true }),
    )

    // 7b. findByID with depth 0 (no relationship population)
    await scenario('findByID leaf at depth 4, depth=0', () =>
      payload.findByID({ collection: 'pages', id: ids.audit, locale: 'de', depth: 0 }),
    )

    // 7c. findByID draft (admin document view)
    await scenario('findByID leaf at depth 4, draft=true [admin doc view]', () =>
      payload.findByID({ collection: 'pages', id: ids.audit, locale: 'de', draft: true }),
    )

    // 7d. findPageByPath with a shared req (does scan+fetch share the ancestor cache?)
    const sharedReq = await createLocalReq({}, payload)
    // clear cache entries outside the measured scenario so this is a real miss
    for (const key of await payload.kv.keys()) {
      await payload.kv.delete(key)
    }
    await scenario('findPageByPath (cache MISS, shared req)', () =>
      findPageByPath({ req: sharedReq, path: '/de/leistungen/web/seo/audit', cache: true }),
    )

    // 9. Write path: update a leaf title (no dependent field change)
    await scenario('update leaf title (dependent fields unchanged)', () =>
      payload.update({
        collection: 'pages',
        id: ids.audit,
        locale: 'de',
        data: { title: 'Audit DE v2' } as any,
      }),
    )

    // 10. Write path: move a page to a different parent
    await scenario('update leaf parent (dependent field changed)', () =>
      payload.update({
        collection: 'pages',
        id: ids.audit,
        locale: 'de',
        data: { parent: ids.web } as any,
      }),
    )

    // 11. Cross-collection chain: every level of the walk alternates between two collections,
    // so each level costs one query per collection instead of one.
    await scenario('findByID topic at depth 4, chain crosses pages and topics', () =>
      payload.findByID({ collection: 'topics', id: ids.m1, locale: 'de' }),
    )

    // 12. Cross-collection list: the five siblings share the same chain, so batching must keep
    // this at the cost of the single read above.
    await scenario('find ALL topics (7 docs), all fields [admin list]', () =>
      payload.find({ collection: 'topics', locale: 'de', limit: 200, pagination: false }),
    )

    // 13. Resolving a path whose segments span both collections.
    for (const key of await payload.kv.keys()) {
      await payload.kv.delete(key)
    }
    await scenario('findPageByPath /de/bereich-1/shop/herren/hemd-1 (cache MISS)', () =>
      findPageByPath({ payload, path: '/de/bereich-1/shop/herren/hemd-1', cache: true }),
    )
    await scenario('findPageByPath /de/bereich-1/shop/herren/hemd-1 (cache HIT)', () =>
      findPageByPath({ payload, path: '/de/bereich-1/shop/herren/hemd-1', cache: true }),
    )
  }, 240_000)
})
