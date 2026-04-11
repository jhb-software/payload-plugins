'use client'

import { useCallback, useEffect, useState } from 'react'

export interface TokenBudgetInfo {
  limit: number
  period: string
  remaining: number
  resetDate: string
  totalTokens: number
}

/**
 * Fetches token budget usage from the given URL.
 *
 * Pass the full path to the usage endpoint (e.g. `/api/chat-agent/usage`).
 * Returns `budget: null` when the endpoint is not configured or the fetch
 * fails, so callers can safely treat a missing budget as "no limit".
 */
export function useTokenBudget(usageUrl: string) {
  const [budget, setBudget] = useState<null | TokenBudgetInfo>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(usageUrl, { credentials: 'include' })
      if (!res.ok) {
        // Budget not configured (404) or other error — treat as no budget
        setBudget(null)
        return
      }
      const data = await res.json()
      setBudget(data)
    } catch {
      setBudget(null)
    }
  }, [usageUrl])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const percentage = budget
    ? Math.min(100, Math.round((budget.totalTokens / budget.limit) * 100))
    : 0
  const exhausted = budget ? budget.totalTokens >= budget.limit : false
  const warning = budget ? percentage >= 80 && !exhausted : false

  return { budget, exhausted, percentage, refresh, warning }
}
