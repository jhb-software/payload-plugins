'use client'

import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { useCallback, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { formatTokens } from './format-tokens.js'
import { CheckIcon } from './icons/CheckIcon.js'
import { ClipboardIcon } from './icons/ClipboardIcon.js'
import { MarkdownContent } from './MarkdownContent.js'

function ToolCallIndicator({
  part,
}: {
  part: { input: unknown; output?: unknown; state: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasOutput = part.state === 'output-available' && part.output !== undefined

  const outputText = hasOutput
    ? typeof part.output === 'string'
      ? part.output
      : JSON.stringify(part.output, null, 2)
    : ''

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [outputText])

  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        marginTop: '6px',
      }}
    >
      <div
        aria-expanded={hasOutput ? expanded : undefined}
        onClick={() => hasOutput && setExpanded((v) => !v)}
        role={hasOutput ? 'button' : undefined}
        style={{
          alignItems: 'center',
          color: 'var(--theme-elevation-500)',
          cursor: hasOutput ? 'pointer' : 'default',
          display: 'flex',
          fontFamily: 'monospace',
          fontSize: '12px',
          gap: '6px',
          padding: '4px 8px',
        }}
        tabIndex={hasOutput ? 0 : undefined}
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
        <span style={{ flex: 1 }}>
          {`${getToolName(part as Parameters<typeof getToolName>[0])}(${part.state !== 'input-streaming' ? JSON.stringify(part.input) : '...'})`}
        </span>
        {hasOutput ? (
          <span style={{ fontSize: '10px', opacity: 0.6 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        ) : null}
      </div>
      {expanded && hasOutput ? (
        <div style={{ borderTop: '1px solid var(--theme-elevation-150)', position: 'relative' }}>
          <button
            aria-label={copied ? 'Copied' : 'Copy JSON'}
            onClick={handleCopy}
            style={{
              background: 'var(--theme-elevation-50)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: '4px',
              color: copied ? 'var(--theme-success-500, #34c759)' : 'var(--theme-elevation-500)',
              cursor: 'pointer',
              padding: '4px',
              position: 'absolute',
              right: '6px',
              top: '6px',
            }}
            title={copied ? 'Copied' : 'Copy JSON'}
            type="button"
          >
            {copied ? (
              <CheckIcon height={14} width={14} />
            ) : (
              <ClipboardIcon height={14} width={14} />
            )}
          </button>
          <pre
            style={{
              background: 'var(--theme-elevation-100)',
              fontSize: '11px',
              margin: 0,
              maxHeight: '300px',
              overflowX: 'auto',
              overflowY: 'auto',
              padding: '8px',
              paddingRight: '32px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {outputText}
          </pre>
        </div>
      ) : null}
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
            wordBreak: 'break-word',
            ...(isUser ? { whiteSpace: 'pre-wrap' as const } : {}),
            ...(isUser
              ? { background: 'var(--theme-elevation-900)', color: 'var(--theme-bg)' }
              : { background: 'var(--theme-elevation-50)', color: 'var(--theme-text)' }),
          }}
        >
          {(() => {
            const text = message.parts
              .filter((p) => p.type === 'text')
              .map((p) => (p as { text: string; type: 'text' }).text)
              .join('')

            if (!text) return '\u2026'
            if (isUser) return text
            return <MarkdownContent>{text}</MarkdownContent>
          })()}
        </div>
        {message.parts
          .filter((p) => isToolUIPart(p))
          .map((p, i: number) => (
            <ToolCallIndicator
              key={i}
              part={p as { input: unknown; output?: unknown; state: string }}
            />
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
