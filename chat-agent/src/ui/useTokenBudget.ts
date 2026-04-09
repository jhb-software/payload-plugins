'use client'

import { useCallback, useEffect, useState } from 'react'

export interface TokenBudgetInfo {
  limit: number
  period: string
  remaining: number
  resetDate: string
  totalTokens: number
}

export function useTokenBudget(endpointUrl: string) {
  const [budget, setBudget] = useState<null | TokenBudgetInfo>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${endpointUrl.replace(/\/chat$/, '')}/usage`, {
        credentials: 'include',
      })
      if (!res.ok) {
        // Budget not configured or other error — treat as no budget
        setBudget(null)
        return
      }
      const data = await res.json()
      setBudget(data)
    } catch {
      setBudget(null)
    } finally {
      setLoading(false)
    }
  }, [endpointUrl])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const percentage = budget
    ? Math.min(100, Math.round((budget.totalTokens / budget.limit) * 100))
    : 0
  const exhausted = budget ? budget.totalTokens >= budget.limit : false
  const warning = budget ? percentage >= 80 && !exhausted : false

  return { budget, exhausted, loading, percentage, refresh, warning }
}
