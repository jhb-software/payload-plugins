'use client'

import { Button } from '@payloadcms/ui'

/**
 * Confirmation dialog shown for write tool calls in `ask` mode.
 * Displays the tool name and input, with Allow/Deny buttons.
 */
export function ToolConfirmation({
  input,
  onAllow,
  onDeny,
  status,
  toolName,
}: {
  input: unknown
  onAllow: () => void
  onDeny: () => void
  status: 'executing' | 'pending'
  toolName: string
}) {
  const isExecuting = status === 'executing'

  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-warning-500, #f5a623)',
        borderRadius: '6px',
        fontSize: '13px',
        marginTop: '6px',
        padding: '8px 12px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          fontWeight: 600,
          gap: '6px',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            background: 'var(--theme-warning-500, #f5a623)',
            borderRadius: '50%',
            flexShrink: 0,
            height: '6px',
            width: '6px',
          }}
        />
        {toolName}
      </div>
      <pre
        style={{
          background: 'var(--theme-elevation-100)',
          borderRadius: '4px',
          fontSize: '11px',
          margin: '0 0 8px',
          maxHeight: '120px',
          overflow: 'auto',
          padding: '6px 8px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(input, null, 2)}
      </pre>
      <div style={{ display: 'flex', gap: '6px' }}>
        <Button disabled={isExecuting} onClick={onAllow} size="small">
          {isExecuting ? 'Executing\u2026' : 'Allow'}
        </Button>
        <Button buttonStyle="secondary" disabled={isExecuting} onClick={onDeny} size="small">
          Deny
        </Button>
      </div>
    </div>
  )
}
