import type { CollectionConfig, PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPayloadBudget, DEFAULT_USAGE_COLLECTION_SLUG } from './budget.js'

/**
 * Minimal in-memory stand-in for `req.payload`. Only implements the three
 * operations this helper uses (`find`, `create`, `update`) so tests exercise
 * the real query / upsert logic without needing a running Payload instance.
 */
function makeFakePayload() {
  const docs: Record<string, unknown>[] = []
  let nextId = 1
  const find = vi.fn(
    ({
      where,
    }: {
      where: { and: [{ scope: { equals: string } }, { period: { equals: string } }] }
    }) => {
      const scope = where.and[0].scope.equals
      const period = where.and[1].period.equals
      const doc = docs.find((d) => d.scope === scope && d.period === period)
      return Promise.resolve({ docs: doc ? [doc] : [] })
    },
  )
  const create = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    const doc = { id: nextId++, ...data }
    docs.push(doc)
    return Promise.resolve(doc)
  })
  const update = vi.fn(({ id, data }: { data: Record<string, unknown>; id: number }) => {
    const doc = docs.find((d) => d.id === id)
    if (!doc) {
      throw new Error('not found')
    }
    Object.assign(doc, data)
    return Promise.resolve(doc)
  })
  return { _docs: docs, create, find, update }
}

function fakeReq(userId: null | number | string = 1): PayloadRequest {
  const payload = makeFakePayload()
  return { payload, user: userId === null ? null : { id: userId } } as unknown as PayloadRequest
}

describe('createPayloadBudget', () => {
  describe('return shape', () => {
    it('returns a BudgetConfig and a CollectionConfig', () => {
      const { budget, collection } = createPayloadBudget({ limit: 100 })
      expect(typeof budget.check).toBe('function')
      expect(typeof budget.record).toBe('function')
      expect(collection.slug).toBe(DEFAULT_USAGE_COLLECTION_SLUG)
    })

    it('uses a custom slug when provided', () => {
      const { collection } = createPayloadBudget({ slug: 'my-usage', limit: 100 })
      expect(collection.slug).toBe('my-usage')
    })
  })

  describe('collection', () => {
    let collection: CollectionConfig
    beforeEach(() => {
      collection = createPayloadBudget({ limit: 100 }).collection
    })

    it('has scope, period, inputTokens, outputTokens, totalTokens fields', () => {
      const names = collection.fields.map((f) => ('name' in f ? f.name : undefined))
      expect(names).toEqual(
        expect.arrayContaining(['scope', 'period', 'inputTokens', 'outputTokens', 'totalTokens']),
      )
    })

    it('is hidden from the admin nav by default', () => {
      expect(collection.admin?.hidden).toBe(true)
    })

    it('denies write access by default (writes go through overrideAccess)', () => {
      // Users must not be able to edit their own usage from the admin panel or
      // the REST API — only the plugin can, via `overrideAccess: true`. Lock
      // this down structurally rather than relying on UI-hidden + honour system.
      expect((collection.access?.create as () => boolean)()).toBe(false)
      expect((collection.access?.update as () => boolean)()).toBe(false)
      expect((collection.access?.delete as () => boolean)()).toBe(false)
    })

    it('allows authenticated read so users/admins can inspect usage', () => {
      const readFn = collection.access?.read as (args: {
        req: { user: unknown }
      }) => boolean
      expect(readFn({ req: { user: null } })).toBe(false)
      expect(readFn({ req: { user: { id: 1 } } })).toBe(true)
    })
  })

  describe('check()', () => {
    it('returns the full limit when no usage has been recorded', async () => {
      const { budget } = createPayloadBudget({ limit: 1000 })
      const req = fakeReq(1)
      const remaining = await budget.check({ req })
      expect(remaining).toBe(1000)
    })

    it('subtracts existing usage from the limit', async () => {
      const { budget } = createPayloadBudget({ limit: 1000 })
      const req = fakeReq(1)
      await budget.record!({
        model: 'x',
        req,
        usage: { inputTokens: 50, outputTokens: 150, totalTokens: 200 },
      })
      const remaining = await budget.check({ req })
      expect(remaining).toBe(800)
    })

    it('returns 0 or negative when the bucket is full', async () => {
      const { budget } = createPayloadBudget({ limit: 100 })
      const req = fakeReq(1)
      await budget.record!({ model: 'x', req, usage: { totalTokens: 120 } })
      const remaining = await budget.check({ req })
      expect(remaining).toBeLessThanOrEqual(0)
    })

    it('throws when scope is "user" and the request has no user', async () => {
      const { budget } = createPayloadBudget({ limit: 100, scope: 'user' })
      const req = fakeReq(null)
      await expect(budget.check({ req })).rejects.toThrow(/authenticated user/i)
    })
  })

  describe('scope', () => {
    it('per-user scope keeps usage isolated across users', async () => {
      const { budget } = createPayloadBudget({ limit: 100, scope: 'user' })
      const reqA = fakeReq('userA')
      // Share the backing store so we can verify cross-user isolation inside
      // a single collection. (Both requests must hit the same fake payload.)
      const sharedPayload = reqA.payload
      const reqB = { payload: sharedPayload, user: { id: 'userB' } } as unknown as PayloadRequest

      await budget.record!({ model: 'x', req: reqA, usage: { totalTokens: 60 } })
      expect(await budget.check({ req: reqA })).toBe(40)
      // User B's bucket is still untouched
      expect(await budget.check({ req: reqB })).toBe(100)
    })

    it('global scope shares usage across all users', async () => {
      const { budget } = createPayloadBudget({ limit: 100, scope: 'global' })
      const reqA = fakeReq('userA')
      const sharedPayload = reqA.payload
      const reqB = { payload: sharedPayload, user: { id: 'userB' } } as unknown as PayloadRequest

      await budget.record!({ model: 'x', req: reqA, usage: { totalTokens: 70 } })
      expect(await budget.check({ req: reqB })).toBe(30)
    })

    it('accepts a custom scope resolver (e.g. per-organization)', async () => {
      const { budget } = createPayloadBudget({
        limit: 100,
        scope: (req) => `org:${(req.user as { org?: string } | null)?.org ?? 'none'}`,
      })
      const reqAcme = {
        payload: makeFakePayload(),
        user: { id: 1, org: 'acme' },
      } as unknown as PayloadRequest
      const reqHooli = {
        payload: reqAcme.payload,
        user: { id: 2, org: 'hooli' },
      } as unknown as PayloadRequest

      await budget.record!({ model: 'x', req: reqAcme, usage: { totalTokens: 40 } })
      expect(await budget.check({ req: reqAcme })).toBe(60)
      expect(await budget.check({ req: reqHooli })).toBe(100)
    })
  })

  describe('period', () => {
    it('daily period buckets by UTC day', async () => {
      // Freeze time on day 1, spend some tokens, then jump to day 2 and
      // confirm the budget has "reset" — i.e. the new day reads a fresh
      // bucket with 0 usage.
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-04-14T23:00:00Z'))
        const { budget } = createPayloadBudget({ limit: 100, period: 'daily' })
        const req = fakeReq(1)
        await budget.record!({ model: 'x', req, usage: { totalTokens: 80 } })
        expect(await budget.check({ req })).toBe(20)

        vi.setSystemTime(new Date('2026-04-15T01:00:00Z'))
        expect(await budget.check({ req })).toBe(100)
      } finally {
        vi.useRealTimers()
      }
    })

    it('monthly period buckets by UTC month', async () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-04-30T23:00:00Z'))
        const { budget } = createPayloadBudget({ limit: 100, period: 'monthly' })
        const req = fakeReq(1)
        await budget.record!({ model: 'x', req, usage: { totalTokens: 80 } })
        expect(await budget.check({ req })).toBe(20)

        vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
        expect(await budget.check({ req })).toBe(100)
      } finally {
        vi.useRealTimers()
      }
    })

    it('defaults to monthly', async () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-04-30T23:00:00Z'))
        const { budget } = createPayloadBudget({ limit: 100 })
        const req = fakeReq(1)
        await budget.record!({ model: 'x', req, usage: { totalTokens: 30 } })

        // Next month → fresh bucket (confirms month, not week or day)
        vi.setSystemTime(new Date('2026-05-15T00:00:00Z'))
        expect(await budget.check({ req })).toBe(100)
      } finally {
        vi.useRealTimers()
      }
    })

    it('accepts a custom period resolver', async () => {
      const currentPeriod = { value: 'week-1' }
      const { budget } = createPayloadBudget({ limit: 100, period: () => currentPeriod.value })
      const req = fakeReq(1)
      await budget.record!({ model: 'x', req, usage: { totalTokens: 40 } })
      expect(await budget.check({ req })).toBe(60)

      currentPeriod.value = 'week-2'
      expect(await budget.check({ req })).toBe(100)
    })
  })

  describe('record()', () => {
    it('creates a new row on first spend', async () => {
      const { budget } = createPayloadBudget({ limit: 1000 })
      const req = fakeReq(1)
      await budget.record!({
        model: 'gpt-4o',
        req,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      })
      const payload = req.payload as unknown as {
        _docs: Array<{ inputTokens: number; outputTokens: number; totalTokens: number }>
      }
      expect(payload._docs).toHaveLength(1)
      expect(payload._docs[0]).toMatchObject({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      })
    })

    it('increments an existing row on subsequent spend (same bucket)', async () => {
      const { budget } = createPayloadBudget({ limit: 1000 })
      const req = fakeReq(1)
      await budget.record!({
        model: 'm',
        req,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      })
      await budget.record!({
        model: 'm',
        req,
        usage: { inputTokens: 5, outputTokens: 15, totalTokens: 20 },
      })
      const payload = req.payload as unknown as {
        _docs: Array<{ inputTokens: number; outputTokens: number; totalTokens: number }>
      }
      expect(payload._docs).toHaveLength(1)
      expect(payload._docs[0].totalTokens).toBe(50)
      expect(payload._docs[0].inputTokens).toBe(15)
      expect(payload._docs[0].outputTokens).toBe(35)
    })

    it('tolerates partial usage objects (missing fields default to 0)', async () => {
      const { budget } = createPayloadBudget({ limit: 1000 })
      const req = fakeReq(1)
      await budget.record!({ model: 'm', req, usage: {} })
      const payload = req.payload as unknown as {
        _docs: Array<{ totalTokens: number }>
      }
      expect(payload._docs[0].totalTokens).toBe(0)
    })
  })
})
