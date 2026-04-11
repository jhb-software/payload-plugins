/**
 * Token usage tracking and budget enforcement for the chat agent plugin.
 *
 * Defines the Payload collection for persisting token consumption per user/period,
 * helper functions for budget checking and usage upsert, and the usage REST endpoint.
 *
 * Types are kept inline to avoid a hard dependency on `payload`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TokenBudgetConfig } from './types.js'

export const TOKEN_USAGE_SLUG = 'chat-token-usage'

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** Return the current period string (e.g. "2026-04" or "2026-04-09"). */
export function getCurrentPeriod(period: 'daily' | 'monthly'): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  if (period === 'daily') {
    const day = String(now.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return `${year}-${month}`
}

/** Return the reset date for a given period. */
export function getResetDate(period: 'daily' | 'monthly'): string {
  const now = new Date()
  if (period === 'daily') {
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    )
    return tomorrow.toISOString().split('T')[0]
  }
  // Monthly: first day of next month
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return nextMonth.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

export const tokenUsageCollection = {
  slug: TOKEN_USAGE_SLUG,
  access: {
    create: () => false,
    delete: () => false,
    read: ({ req }: any) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
    update: () => false,
  },
  admin: {
    hidden: true,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      admin: { readOnly: true },
      index: true,
      relationTo: 'users',
      required: true,
    },
    {
      name: 'period',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'periodType',
      type: 'select',
      options: [
        { label: 'Daily', value: 'daily' },
        { label: 'Monthly', value: 'monthly' },
      ],
      required: true,
    },
    {
      name: 'inputTokens',
      type: 'number',
      required: true,
    },
    {
      name: 'outputTokens',
      type: 'number',
      required: true,
    },
    {
      name: 'totalTokens',
      type: 'number',
      required: true,
    },
  ],
  indexes: [
    // Compound index for fast lookups by (user, period, periodType).
    // Non-unique because records are append-only — one row per chat response.
    { fields: ['user', 'periodType', 'period'] },
  ],
  timestamps: true,
}

// ---------------------------------------------------------------------------
// Budget check
// ---------------------------------------------------------------------------

export interface BudgetCheckResult {
  allowed: boolean
  limit: number
  remaining: number
  resetDate: string
  totalTokens: number
}

/**
 * Check whether a user (or global) has remaining budget.
 * Returns usage info including whether the request is allowed.
 */
export async function checkBudget(
  payload: any,
  userId: number | string,
  config: TokenBudgetConfig,
  req?: any,
): Promise<BudgetCheckResult> {
  const period = config.period ?? 'monthly'
  const limitBy = config.limitBy ?? 'user'
  const currentPeriod = getCurrentPeriod(period)
  const resetDate = getResetDate(period)

  // Resolve per-user limit override
  let limit = config.limit
  if (config.resolveLimit && req) {
    const override = await config.resolveLimit(req)
    if (override !== undefined) {
      limit = override
    }
  }

  // Query current usage — filter by periodType so that switching
  // between 'daily' and 'monthly' does not leak records across.
  const where: any = {
    period: { equals: currentPeriod },
    periodType: { equals: period },
  }
  if (limitBy === 'user') {
    where.user = { equals: userId }
  }

  // Iterate in pages to correctly sum the entire period's usage without
  // loading everything into memory at once. The append-only model means
  // a `limitBy: 'global'` deployment can easily exceed 10k rows/period;
  // a naive single-query cap would silently undercount and give free tokens.
  // For typical `limitBy: 'user'` usage there are few rows per period, so
  // the loop exits after the first page.
  const PAGE_SIZE = 1000
  let totalTokens = 0
  let page = 1
  // Soft guard against runaway loops (e.g. a DB misconfigured to always
  // report hasNextPage). 1000 pages × 1000 rows = 1M rows — far beyond
  // any realistic period for a chat agent.
  const MAX_PAGES = 1000
  while (page <= MAX_PAGES) {
    const result = await payload.find({
      collection: TOKEN_USAGE_SLUG,
      depth: 0,
      limit: PAGE_SIZE,
      overrideAccess: true,
      page,
      where,
    })
    for (const doc of result.docs) {
      totalTokens += sanitizeTokenCount(doc.totalTokens)
    }
    if (!result.hasNextPage) {
      break
    }
    page++
  }

  return {
    allowed: totalTokens < limit,
    limit,
    remaining: Math.max(0, limit - totalTokens),
    resetDate,
    totalTokens,
  }
}

/**
 * Compute a reasonable `maxOutputTokens` cap for a single step given the
 * user's remaining budget.
 *
 * Combined with {@link createBudgetStopCondition}, this bounds the worst-case
 * overspend per request to roughly one step's worth of output tokens (the
 * stop condition fires after a step completes, so the step that trips the
 * budget can still emit up to this ceiling).
 */
export function computeMaxOutputTokens(
  remaining: null | number,
  ceiling = 8192,
): number | undefined {
  if (remaining === null) {
    return undefined
  }
  return Math.max(1, Math.min(remaining, ceiling))
}

/**
 * Build a stop condition that halts the AI SDK tool-use loop when the
 * cumulative token usage across all completed steps exceeds `remaining`.
 *
 * Background: Vercel AI SDK's `maxOutputTokens` is applied to every step,
 * not cumulatively. With `stepCountIs(20)` alone, a single request could
 * emit up to 20 × maxOutputTokens tokens — easily 10× a user's remaining
 * budget. This stop condition is evaluated after each step, so the worst
 * case is one additional step beyond the budget.
 */
export function createBudgetStopCondition(remaining: number) {
  return function budgetStopCondition({
    steps,
  }: {
    steps: readonly { usage?: { totalTokens?: number } }[]
  }): boolean {
    let used = 0
    for (const step of steps) {
      used += sanitizeTokenCount(step.usage?.totalTokens)
    }
    return used >= remaining
  }
}

/**
 * Clamp a token count from the model to a safe non-negative integer.
 *
 * Returns 0 for NaN, undefined, negative, or non-number inputs. Without
 * this, a rogue `NaN` from the provider (or a future SDK quirk) would
 * poison `checkBudget` sums — `NaN < limit` is `false`, so the user
 * would be permanently stuck above budget.
 */
export function sanitizeTokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.floor(value)
}

// ---------------------------------------------------------------------------
// Record usage (append-only)
// ---------------------------------------------------------------------------

/**
 * Record token consumption for the current user + period.
 *
 * Uses an append-only model: each call creates a new row. This is race-free
 * under concurrent requests (no read-modify-write) and gives per-request
 * auditability. `checkBudget` sums the rows on read.
 *
 * Token counts are sanitized via {@link sanitizeTokenCount} so a NaN or
 * negative value from the provider cannot poison future budget checks.
 * If all three counts sanitize to 0, the record is skipped entirely.
 */
export async function recordUsage(
  payload: any,
  userId: number | string,
  period: 'daily' | 'monthly',
  tokens: { inputTokens: unknown; outputTokens: unknown; totalTokens: unknown },
): Promise<void> {
  const inputTokens = sanitizeTokenCount(tokens.inputTokens)
  const outputTokens = sanitizeTokenCount(tokens.outputTokens)
  const totalTokens = sanitizeTokenCount(tokens.totalTokens)

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return
  }

  const currentPeriod = getCurrentPeriod(period)

  await payload.create({
    collection: TOKEN_USAGE_SLUG,
    data: {
      inputTokens,
      outputTokens,
      period: currentPeriod,
      periodType: period,
      totalTokens,
      user: userId,
    },
    overrideAccess: true,
  })
}

/**
 * Record final chat-response usage and log any failure.
 *
 * Extracted as a named helper so callers can await it (e.g. inside an AI
 * SDK `onFinish` callback, which the SDK does await before tearing down
 * the stream — important in serverless runtimes that terminate the
 * function as soon as the stream closes).
 */
export async function recordUsageAndLogErrors(args: {
  payload: any
  period: 'daily' | 'monthly'
  tokens: { inputTokens: unknown; outputTokens: unknown; totalTokens: unknown }
  userId: number | string
}): Promise<void> {
  const { payload, period, tokens, userId } = args
  try {
    await recordUsage(payload, userId, period, tokens)
  } catch (err: unknown) {
    payload.logger?.error?.({ err, userId }, 'chat-agent: failed to record token usage')
  }
}

// ---------------------------------------------------------------------------
// Usage endpoint handler
// ---------------------------------------------------------------------------

/** GET /api/chat-agent/usage — return current user's usage and budget info */
export function createUsageHandler(config: TokenBudgetConfig) {
  return async function usageHandler(req: any): Promise<Response> {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await checkBudget(req.payload, req.user.id, config, req)

    return Response.json({
      limit: result.limit,
      period: config.period ?? 'monthly',
      remaining: result.remaining,
      resetDate: result.resetDate,
      totalTokens: result.totalTokens,
    })
  }
}
