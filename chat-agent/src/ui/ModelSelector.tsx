'use client'

import { FieldLabel, type ReactSelectOption as Option, ReactSelect } from '@payloadcms/ui'
import { useId } from 'react'

import type { ModelOption } from '../types.js'

export function ModelSelector({
  available,
  disabled,
  onChange,
  value,
}: {
  available: ModelOption[]
  disabled?: boolean
  onChange: (modelId: string) => void
  value: string
}) {
  const inputId = useId()

  if (available.length <= 1) {
    return null
  }

  const options: Option[] = available.map((m) => ({
    label: m.label,
    value: m.id,
  }))
  const selected = options.find((o) => o.value === value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
      <FieldLabel htmlFor={inputId} label="Model" />
      <ReactSelect
        className="chat-agent-select chat-agent-select--slim"
        disabled={disabled}
        inputId={inputId}
        isClearable={false}
        isSearchable={false}
        onChange={(next) => {
          const picked = Array.isArray(next) ? next[0] : next
          if (picked && typeof picked.value === 'string') {
            onChange(picked.value)
          }
        }}
        options={options}
        value={selected}
      />
    </div>
  )
}
