/**
 * Built-in helper: a per-scope, per-period token budget persisted in a Payload
 * collection. Covers the common "limit each user to N tokens per day/month"
 * use case without forcing users to wire up storage themselves.
 *
 * For custom stores (Redis, in-memory, usage API from a billing system, …),
 * implement the `BudgetConfig` primitive directly — this helper is only one
 * way to satisfy it.
 */

import type { CollectionConfig, DefaultDocumentIDType, PayloadRequest } from 'payload'

import type { BudgetConfig, BudgetUsage } from './types.js'

export const DEFAULT_USAGE_COLLECTION_SLUG = 'agent-token-usage'

/**
 * Resolves a `BudgetConfig`-compatible "period key" from a request. Built-in
 * `'daily'` and `'monthly'` use UTC to avoid timezone ambiguity.
 */
export type PeriodResolver = (req: PayloadRequest) => string

/**
 * Resolves the scope key a usage row is bucketed by. Return `'global'` for a
 * shared cap, `user:<id>` for per-user, or anything else for team/org rules.
 */
export type ScopeResolver = (req: PayloadRequest) => string

export interface CreatePayloadBudgetOptions {
  /**
   * Maximum total tokens permitted per (scope, period) bucket.
   */
  limit: number
  /**
   * How the budget window rolls over.
   *   - `'daily'`   → UTC day, `YYYY-MM-DD`
   *   - `'monthly'` → UTC month, `YYYY-MM`
   *   - function    → caller-defined (e.g. weekly, fiscal period)
   *
   * Default: `'monthly'`.
   */
  period?: 'daily' | 'monthly' | PeriodResolver
  /**
   * Bucket usage by.
   *   - `'user'`   → per Payload user id (`user:<id>`)
   *   - `'global'` → single shared bucket (`global`)
   *   - function   → caller-defined (e.g. `org:<orgId>`)
   *
   * Default: `'user'`.
   */
  scope?: 'global' | 'user' | ScopeResolver
  /**
   * Collection slug used for the usage store. Override when you need more
   * than one independent budget in the same project, or to avoid a naming
   * clash. Default: `'agent-token-usage'`.
   */
  slug?: string
}

export interface CreatePayloadBudgetResult {
  /** Drop-in `BudgetConfig` — pass to `chatAgentPlugin({ budget })`. */
  budget: BudgetConfig
  /** Drop-in collection — add to Payload's `collections` array. */
  collection: CollectionConfig
}

// ---------------------------------------------------------------------------
// Period / scope resolvers
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in UTC — matches the `toISOString` prefix without the time.
  return d.toISOString().slice(0, 10)
}

function toIsoMonth(d: Date): string {
  // YYYY-MM in UTC.
  return d.toISOString().slice(0, 7)
}

function resolvePeriod(period: CreatePayloadBudgetOptions['period']): PeriodResolver {
  if (typeof period === 'function') {
    return period
  }
  if (period === 'daily') {
    return () => toIsoDate(new Date())
  }
  // Default: monthly
  return () => toIsoMonth(new Date())
}

function resolveScope(scope: CreatePayloadBudgetOptions['scope']): ScopeResolver {
  if (typeof scope === 'function') {
    return scope
  }
  if (scope === 'global') {
    return () => 'global'
  }
  // Default: per user
  return (req) => {
    const id = req.user?.id
    if (id === undefined || id === null) {
      throw new Error(
        'createPayloadBudget: per-user scope requires an authenticated user. ' +
          'Use scope: "global" or a custom function for unauthenticated flows.',
      )
    }
    return `user:${String(id)}`
  }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Builds the usage collection. Access is locked down to prevent users from
 * editing their own usage: writes always go through `overrideAccess: true`
 * from the plugin, reads are allowed for authenticated users so the admin UI
 * can surface per-user history.
 */
function buildUsageCollection(slug: string): CollectionConfig {
  return {
    slug,
    access: {
      create: () => false,
      delete: () => false,
      read: ({ req }) => !!req.user,
      update: () => false,
    },
    admin: {
      defaultColumns: ['scope', 'period', 'model', 'totalTokens', 'updatedAt'],
      group: 'Chat',
      hidden: true,
    },
    fields: [
      // A composite (scope, period, model) defines a single usage bucket.
      // Keeping `model` in the key preserves per-model breakdowns for cost
      // attribution; `check` still aggregates across models.
      { name: 'scope', type: 'text', index: true, required: true },
      { name: 'period', type: 'text', index: true, required: true },
      { name: 'model', type: 'text', index: true, required: true },
      { name: 'inputTokens', type: 'number', defaultValue: 0 },
      { name: 'outputTokens', type: 'number', defaultValue: 0 },
      { name: 'totalTokens', type: 'number', defaultValue: 0 },
    ],
    timestamps: true,
  }
}

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------

interface UsageDoc {
  id: DefaultDocumentIDType
  inputTokens?: null | number
  outputTokens?: null | number
  totalTokens?: null | number
}

// The slug is caller-configurable so the plugin can't statically narrow it
// to a specific collection in Payload's generated `CollectionSlug` union.
// We widen via `as never` at the call sites — the user supplies the
// matching collection from `createPayloadBudget`'s `collection` return value,
// so schema shape is guaranteed at runtime.

async function findUsageDoc(
  req: PayloadRequest,
  slug: string,
  scope: string,
  period: string,
  model: string,
): Promise<null | UsageDoc> {
  const result = await req.payload.find({
    collection: slug as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { scope: { equals: scope } },
        { period: { equals: period } },
        { model: { equals: model } },
      ],
    },
  })
  return (result.docs[0] as undefined | UsageDoc) ?? null
}

async function getUsedTokens(
  req: PayloadRequest,
  slug: string,
  scope: string,
  period: string,
): Promise<number> {
  // Sum across every model in this (scope, period) bucket — the budget caps
  // total spend regardless of which model was used.
  const result = await req.payload.find({
    collection: slug as never,
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [{ scope: { equals: scope } }, { period: { equals: period } }],
    },
  })
  return (result.docs as UsageDoc[]).reduce((sum, d) => sum + (d.totalTokens ?? 0), 0)
}

async function addUsage(
  req: PayloadRequest,
  slug: string,
  scope: string,
  period: string,
  model: string,
  usage: BudgetUsage,
): Promise<void> {
  const existing = await findUsageDoc(req, slug, scope, period, model)
  const delta = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  }
  if (!existing) {
    await req.payload.create({
      collection: slug as never,
      data: { ...delta, model, period, scope } as never,
      overrideAccess: true,
    })
    return
  }
  await req.payload.update({
    id: existing.id,
    collection: slug as never,
    data: {
      inputTokens: (existing.inputTokens ?? 0) + delta.inputTokens,
      outputTokens: (existing.outputTokens ?? 0) + delta.outputTokens,
      totalTokens: (existing.totalTokens ?? 0) + delta.totalTokens,
    } as never,
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/**
 * Build a ready-to-use `BudgetConfig` backed by a Payload collection.
 *
 * ```ts
 * const { budget, collection } = createPayloadBudget({
 *   limit: 50_000,
 *   period: 'daily',
 *   scope: 'user',
 * })
 *
 * export default buildConfig({
 *   collections: [...mine, collection],
 *   plugins: [chatAgentPlugin({ budget, ... })],
 * })
 * ```
 *
 * Under the hood: one row per (scope, period, model). On each completed chat
 * request the `totalTokens` field for the current bucket is incremented. On
 * every incoming request `check` sums `totalTokens` across every model in the
 * current (scope, period) and returns `limit - used`.
 */
export function createPayloadBudget(
  options: CreatePayloadBudgetOptions,
): CreatePayloadBudgetResult {
  const slug = options.slug ?? DEFAULT_USAGE_COLLECTION_SLUG
  const resolvePeriodFn = resolvePeriod(options.period)
  const resolveScopeFn = resolveScope(options.scope)

  return {
    budget: {
      check: async ({ req }) => {
        const scope = resolveScopeFn(req)
        const period = resolvePeriodFn(req)
        const used = await getUsedTokens(req, slug, scope, period)
        return options.limit - used
      },
      record: async ({ model, req, usage }) => {
        const scope = resolveScopeFn(req)
        const period = resolvePeriodFn(req)
        await addUsage(req, slug, scope, period, model, usage)
      },
    },
    collection: buildUsageCollection(slug),
  }
}
