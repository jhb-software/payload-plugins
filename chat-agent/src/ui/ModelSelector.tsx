'use client'

import type { ModelOption } from '../types.js'

export function ModelSelector({
  available,
  onChange,
  value,
}: {
  available: ModelOption[]
  onChange: (modelId: string) => void
  value: string
}) {
  if (available.length <= 1) {
    return null
  }

  return (
    <select
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--theme-input-bg, var(--theme-bg))',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-m, 6px)',
        color: 'var(--theme-text)',
        cursor: 'pointer',
        fontSize: '13px',
        padding: '4px 8px',
      }}
      value={value}
    >
      {available.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
