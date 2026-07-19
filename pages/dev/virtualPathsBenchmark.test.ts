import { appendFileSync } from 'node:fs'
import payload from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { clearPathCache, findPageByPath } from '@jhb.software/payload-pages-plugin'
import config from './src/payload.config'

/**
 * Benchmark for the virtual-path computation under simulated database latency.
 *
 * Every database read is delayed by DB_LATENCY_MS (default 1ms) to model a serverless
 * function and its database running in the same cloud region (e.g. a Vercel function in
 * AWS eu-central-1 with MongoDB Atlas / Postgres in the same region). This makes the
 * query-count differences of the ancestor resolution visible as realistic wall-clock time.
 *
 * Not part of the regular test suite. Run with:
 *   RUN_BENCHMARK=1 PAYLOAD_DATABASE=sqlite pnpm vitest run virtualPathsBenchmark
 */

const LATENCY_MS = Number(process.env.DB_LATENCY_MS ?? '1')

const PARENT_COUNT = 10
const CHILDREN_PER_PARENT = 5
const DEEP_CHAIN_DEPTH = 5

describe.runIf(process.env.RUN_BENCHMARK === '1')(
  'Virtual paths benchmark (simulated same-region DB latency)',
  () => {
    const createdIds: (number | string)[] = []
    const restoreFns: (() => void)[] = []
    let queryCount = 0

    /** Delays and counts every database read to simulate network latency to the DB. */
    const wrapDbReadsWithLatency = () => {
      const db = payload.db as unknown as Record<string, unknown>
      for (const name of ['find', 'findOne', 'findVersions', 'queryDrafts', 'count']) {
        const original = db[name]
        if (typeof original !== 'function') {
          continue
        }
        const bound = (original as (...args: unknown[]) => unknown).bind(payload.db)
        db[name] = async (...args: unknown[]) => {
          queryCount++
          await new Promise((resolve) => setTimeout(resolve, LATENCY_MS))
          return bound(...args)
        }
        restoreFns.push(() => {
          db[name] = original
        })
      }
    }

    const createPage = async (slug: string, parent?: number | string) => {
      const page = await payload.create({
        collection: 'pages',
        locale: 'de',
        data: {
          title: slug,
          slug,
          content: slug,
          ...(parent ? { parent } : {}),
          // payload.create only publishes when _status is explicitly set
          _status: 'published',
          breadcrumbs: [],
          meta: { alternatePaths: [] },
          path: '',
        },
      })
      createdIds.push(page.id)
      return page
    }

    const measure = async (
      name: string,
      iterations: number,
      fn: (iteration: number) => Promise<void>,
    ) => {
      const startCount = queryCount
      const times: number[] = []
      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await fn(i)
        times.push(performance.now() - start)
      }
      const queriesPerOp = (queryCount - startCount) / iterations
      const avg = times.reduce((a, b) => a + b, 0) / times.length
      report(
        `${name.padEnd(58)} ${queriesPerOp.toFixed(1).padStart(10)} ${avg.toFixed(1).padStart(9)} ${Math.min(
          ...times,
        )
          .toFixed(1)
          .padStart(8)} ${Math.max(...times)
          .toFixed(1)
          .padStart(8)}`,
      )
    }

    /** Logs a result line and appends it to BENCH_RESULTS_FILE (vitest hides logs of passing tests). */
    const report = (line: string) => {
      console.log(line)
      if (process.env.BENCH_RESULTS_FILE) {
        appendFileSync(process.env.BENCH_RESULTS_FILE, line + '\n')
      }
    }

    beforeAll(async () => {
      await payload.init({ config })

      // Seed a realistic tree: root -> 10 parents -> 5 children each, plus one deep chain.
      const root = await createPage('bench-root')
      for (let p = 0; p < PARENT_COUNT; p++) {
        const parent = await createPage(`bench-p${p}`, root.id)
        for (let c = 0; c < CHILDREN_PER_PARENT; c++) {
          await createPage(`bench-p${p}-c${c}`, parent.id)
        }
      }
      let deepParent: number | string = root.id
      for (let d = 1; d <= DEEP_CHAIN_DEPTH; d++) {
        deepParent = (await createPage(`bench-deep-${d}`, deepParent)).id
      }

      wrapDbReadsWithLatency()
    }, 120_000)

    afterAll(async () => {
      for (const restore of restoreFns) {
        restore()
      }
      for (const id of [...createdIds].reverse()) {
        await payload.delete({ collection: 'pages', id })
      }
      if (payload.db && typeof payload.db.destroy === 'function') {
        await payload.db.destroy()
      }
    }, 120_000)

    test('benchmark', async () => {
      report(
        `\nSimulated DB read latency: ${LATENCY_MS}ms (~same AWS region), adapter: ${process.env.PAYLOAD_DATABASE ?? 'mongodb'}\n`,
      )
      report(
        `${'scenario'.padEnd(58)} ${'queries/op'.padStart(10)} ${'avg ms'.padStart(9)} ${'min'.padStart(8)} ${'max'.padStart(8)}`,
      )

      await measure('single page by slug (depth 3, locale de)', 20, async () => {
        const result = await payload.find({
          collection: 'pages',
          locale: 'de',
          where: { slug: { equals: 'bench-p5-c3' } },
        })
        expect(result.docs[0].path).toBe('/de/bench-root/bench-p5/bench-p5-c3')
      })

      await measure(
        `single page by slug (depth ${DEEP_CHAIN_DEPTH + 1}, locale de)`,
        20,
        async () => {
          const result = await payload.find({
            collection: 'pages',
            locale: 'de',
            where: { slug: { equals: `bench-deep-${DEEP_CHAIN_DEPTH}` } },
          })
          expect(result.docs[0].path).toContain(`/bench-deep-${DEEP_CHAIN_DEPTH}`)
        },
      )

      await measure('sitemap: all pages, locale all, select path/meta', 5, async () => {
        const result = await payload.find({
          collection: 'pages',
          limit: 200,
          locale: 'all',
          pagination: false,
          select: { breadcrumbs: true, meta: true, path: true },
        })
        expect(result.docs.length).toBeGreaterThanOrEqual(
          PARENT_COUNT * CHILDREN_PER_PARENT + PARENT_COUNT + DEEP_CHAIN_DEPTH + 1,
        )
      })

      await measure('findPageByPath: cold (path cache miss)', 10, async () => {
        await clearPathCache(payload)
        const result = await findPageByPath({
          path: '/de/bench-root/bench-p5/bench-p5-c3',
          payload,
        })
        expect(result?.doc.path).toBe('/de/bench-root/bench-p5/bench-p5-c3')
      })

      // Warm the cache once, then measure repeated lookups (the website hot path).
      await findPageByPath({ path: '/de/bench-root/bench-p5/bench-p5-c3', payload })
      await measure('findPageByPath: warm (path cache hit)', 20, async () => {
        const result = await findPageByPath({
          path: '/de/bench-root/bench-p5/bench-p5-c3',
          payload,
        })
        expect(result?.doc.path).toBe('/de/bench-root/bench-p5/bench-p5-c3')
      })
    }, 300_000)
  },
)
