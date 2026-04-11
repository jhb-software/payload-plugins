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

  const result = await payload.find({
    collection: TOKEN_USAGE_SLUG,
    depth: 0,
    // Append-only model: one row per chat response. Cap at a high but
    // bounded number to avoid unbounded memory growth on pathological inputs.
    // A user hitting 10k requests/period already has other problems.
    limit: 10_000,
    overrideAccess: true,
    pagination: false,
    where,
  })

  let totalTokens = 0
  for (const doc of result.docs) {
    totalTokens += doc.totalTokens ?? 0
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
 * Compute a reasonable `maxOutputTokens` cap for a single chat response
 * given the user's remaining budget.
 *
 * Caps output tokens at `min(remaining, ceiling)` so a user near their
 * budget limit cannot burn through the rest (and far beyond) in a single
 * long response. Returns `undefined` when there is no budget configured.
 *
 * Note: this only caps output tokens. Input tokens and tool-use step input
 * growth are not bounded here — the per-request budget gate in `checkBudget`
 * is the primary defense.
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

// ---------------------------------------------------------------------------
// Record usage (append-only)
// ---------------------------------------------------------------------------

/**
 * Record token consumption for the current user + period.
 *
 * Uses an append-only model: each call creates a new row. This is race-free
 * under concurrent requests (no read-modify-write) and gives per-request
 * auditability. `checkBudget` sums the rows on read.
 */
export async function recordUsage(
  payload: any,
  userId: number | string,
  period: 'daily' | 'monthly',
  tokens: { inputTokens: number; outputTokens: number; totalTokens: number },
): Promise<void> {
  const currentPeriod = getCurrentPeriod(period)

  await payload.create({
    collection: TOKEN_USAGE_SLUG,
    data: {
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      period: currentPeriod,
      periodType: period,
      totalTokens: tokens.totalTokens,
      user: userId,
    },
    overrideAccess: true,
  })
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
