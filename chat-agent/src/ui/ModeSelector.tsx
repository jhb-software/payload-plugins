'use client'

import { FieldLabel, type ReactSelectOption as Option, ReactSelect } from '@payloadcms/ui'
import { useId } from 'react'

import type { AgentMode } from '../types.js'

const MODE_LABELS: Record<AgentMode, string> = {
  ask: 'Confirm writes',
  read: 'Read only',
  'read-write': 'Read & write',
  superuser: 'Superuser (bypass permissions)',
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
  const inputId = useId()

  if (availableModes.length <= 1) {
    return null
  }

  const options: Option[] = availableModes.map((m) => ({
    label: MODE_LABELS[m],
    value: m,
  }))
  const selected = options.find((o) => o.value === mode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '160px' }}>
      <FieldLabel htmlFor={inputId} label="Mode" />
      <ReactSelect
        className="chat-agent-select chat-agent-select--slim"
        disabled={disabled}
        inputId={inputId}
        isClearable={false}
        isSearchable={false}
        onChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value
          if (next && typeof next.value === 'string') {
            onModeChange(next.value as AgentMode)
          }
        }}
        options={options}
        value={selected}
      />
    </div>
  )
}
