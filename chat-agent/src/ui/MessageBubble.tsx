'use client'

import { getToolName, isToolUIPart, type UIMessage } from 'ai'

import type { MessageMetadata } from '../types.js'

import { formatTokens } from './format-tokens.js'

function ToolCallIndicator({ part }: { part: { input: unknown; state: string } }) {
  return (
    <div
      style={{
        alignItems: 'center',
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        color: 'var(--theme-elevation-500)',
        display: 'flex',
        fontFamily: 'monospace',
        fontSize: '12px',
        gap: '6px',
        marginTop: '6px',
        padding: '4px 8px',
      }}
    >
      <span
        style={{
          background:
            part.state === 'output-available'
              ? 'var(--theme-success-500, #34c759)'
              : 'var(--theme-warning-500, #f5a623)',
          borderRadius: '50%',
          flexShrink: 0,
          height: '6px',
          width: '6px',
        }}
      />
      {`${getToolName(part as Parameters<typeof getToolName>[0])}(${part.state !== 'input-streaming' ? JSON.stringify(part.input) : '...'})`}
    </div>
  )
}

export function MessageBubble({ message }: { message: UIMessage<MessageMetadata> }) {
  const isUser = message.role === 'user'
  const meta = message.metadata

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '85%', minWidth: '120px' }}>
        <div
          style={{
            borderRadius: '12px',
            fontSize: '14px',
            lineHeight: '1.5',
            padding: '10px 14px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...(isUser
              ? { background: 'var(--theme-elevation-900)', color: 'var(--theme-bg)' }
              : { background: 'var(--theme-elevation-50)', color: 'var(--theme-text)' }),
          }}
        >
          {message.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { text: string; type: 'text' }).text)
            .join('') || '\u2026'}
        </div>
        {message.parts
          .filter((p) => isToolUIPart(p))
          .map((p, i: number) => (
            <ToolCallIndicator key={i} part={p as { input: unknown; state: string }} />
          ))}
        {!isUser && meta?.totalTokens ? (
          <div style={{ color: 'var(--theme-elevation-400)', fontSize: '11px', marginTop: '4px' }}>
            {[meta.model, formatTokens(meta.totalTokens)].filter(Boolean).join(' \u00b7 ')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
