'use client'

import type { AgentMode } from '../types.js'

const MODE_LABELS: Record<AgentMode, string> = {
  ask: 'Ask',
  read: 'Read',
  'read-write': 'Read-Write',
  superuser: 'Superuser',
}

const MODE_DESCRIPTIONS: Record<AgentMode, string> = {
  ask: 'Write operations require confirmation',
  read: 'Read-only, no write operations',
  'read-write': 'Full access, no confirmation',
  superuser: 'Full access, bypasses permissions',
}

export function ModeSelector({
  availableModes,
  disabled,
  mode,
  onModeChange,
}: {
  availableModes: AgentMode[]
  disabled?: boolean
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
}) {
  if (availableModes.length <= 1) {
    return null
  }

  return (
    <select
      disabled={disabled}
      onChange={(e) => onModeChange(e.target.value as AgentMode)}
      style={{
        background: 'var(--theme-input-bg, var(--theme-bg))',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s, 4px)',
        color: 'var(--theme-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '13px',
        opacity: disabled ? 0.6 : 1,
        padding: '4px 8px',
      }}
      title={MODE_DESCRIPTIONS[mode]}
      value={mode}
    >
      {availableModes.map((m) => (
        <option key={m} value={m}>
          {MODE_LABELS[m]}
        </option>
      ))}
    </select>
  )
}
