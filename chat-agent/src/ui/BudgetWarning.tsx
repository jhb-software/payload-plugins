'use client'

import type { TokenBudgetInfo } from './useTokenBudget.js'

export function BudgetWarning({
  budget,
  exhausted,
  percentage,
  warning,
}: {
  budget: null | TokenBudgetInfo
  exhausted: boolean
  percentage: number
  warning: boolean
}) {
  if (!budget || (!warning && !exhausted)) {
    return null
  }

  if (exhausted) {
    return (
      <div
        style={{
          background: 'var(--theme-error-50, #fff5f5)',
          border: '1px solid var(--theme-error-200, #fcc)',
          borderRadius: 'var(--style-radius-m, 6px)',
          color: 'var(--theme-error-500)',
          fontSize: '13px',
          marginTop: '8px',
          padding: '8px 12px',
        }}
      >
        Token budget exceeded. Chat is disabled until {budget.resetDate}.
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--theme-warning-50, #fffbe6)',
        border: '1px solid var(--theme-warning-200, #ffe58f)',
        borderRadius: 'var(--style-radius-m, 6px)',
        color: 'var(--theme-warning-700, #ad6800)',
        fontSize: '13px',
        marginTop: '8px',
        padding: '8px 12px',
      }}
    >
      {percentage}% of token budget used. Resets on {budget.resetDate}.
    </div>
  )
}
