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
    group: 'Chat',
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
      name: 'inputTokens',
      type: 'number',
      defaultValue: 0,
      required: true,
    },
    {
      name: 'outputTokens',
      type: 'number',
      defaultValue: 0,
      required: true,
    },
    {
      name: 'totalTokens',
      type: 'number',
      defaultValue: 0,
      required: true,
    },
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

  // Query current usage
  const where: any = { period: { equals: currentPeriod } }
  if (limitBy === 'user') {
    where.user = { equals: userId }
  }

  const result = await payload.find({
    collection: TOKEN_USAGE_SLUG,
    depth: 0,
    limit: 0,
    overrideAccess: true,
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

// ---------------------------------------------------------------------------
// Usage upsert
// ---------------------------------------------------------------------------

/**
 * Record token consumption for the current user + period.
 * Creates a new record if none exists, otherwise increments the existing one.
 */
export async function recordUsage(
  payload: any,
  userId: number | string,
  period: 'daily' | 'monthly',
  tokens: { inputTokens: number; outputTokens: number; totalTokens: number },
): Promise<void> {
  const currentPeriod = getCurrentPeriod(period)

  // Find existing record for this user + period
  const existing = await payload.find({
    collection: TOKEN_USAGE_SLUG,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ user: { equals: userId } }, { period: { equals: currentPeriod } }],
    },
  })

  if (existing.docs.length > 0) {
    const doc = existing.docs[0]
    await payload.update({
      id: doc.id,
      collection: TOKEN_USAGE_SLUG,
      data: {
        inputTokens: (doc.inputTokens ?? 0) + tokens.inputTokens,
        outputTokens: (doc.outputTokens ?? 0) + tokens.outputTokens,
        totalTokens: (doc.totalTokens ?? 0) + tokens.totalTokens,
      },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: TOKEN_USAGE_SLUG,
      data: {
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        period: currentPeriod,
        totalTokens: tokens.totalTokens,
        user: userId,
      },
      overrideAccess: true,
    })
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
