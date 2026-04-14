'use client'

import type React from 'react'

import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { useCallback, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { formatTokens } from './format-tokens.js'
import { CheckIcon } from './icons/CheckIcon.js'
import { ClipboardIcon } from './icons/ClipboardIcon.js'
import { MarkdownContent } from './MarkdownContent.js'
import { ToolConfirmation } from './ToolConfirmation.js'

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
      }}
    >
      <div
        {...(hasOutput
          ? {
              'aria-expanded': expanded,
              onClick: () => setExpanded((v) => !v),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpanded((v) => !v)
                }
              },
              role: 'button' as const,
              tabIndex: 0,
            }
          : {})}
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

export function MessageBubble({
  isLoading,
  message,
  onToolApprove,
  onToolDeny,
}: {
  isLoading?: boolean
  message: UIMessage<MessageMetadata>
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
}) {
  const isUser = message.role === 'user'
  const meta = message.metadata

  const bubbleStyle: React.CSSProperties = {
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: '1.5',
    padding: '10px 14px',
    wordBreak: 'break-word',
    ...(isUser ? { whiteSpace: 'pre-wrap' as const } : {}),
    ...(isUser
      ? { background: 'var(--theme-elevation-900)', color: 'var(--theme-bg)' }
      : { background: 'var(--theme-elevation-50)', color: 'var(--theme-text)' }),
  }

  const rendered: React.ReactNode[] = []
  let textBuffer = ''
  let textKey = 0

  const flushText = () => {
    if (!textBuffer) {
      return
    }
    const current = textBuffer
    textBuffer = ''
    rendered.push(
      <div key={`text-${textKey++}`} style={bubbleStyle}>
        {isUser ? current : <MarkdownContent>{current}</MarkdownContent>}
      </div>,
    )
  }

  message.parts.forEach((part, i) => {
    if (part.type === 'text') {
      textBuffer += (part as { text: string; type: 'text' }).text
      return
    }
    if (!isToolUIPart(part)) {
      return
    }
    flushText()
    const toolPart = part as {
      approval?: { approved?: boolean; id: string }
      input: unknown
      output?: unknown
      state: string
    }
    const toolName = getToolName(toolPart as Parameters<typeof getToolName>[0])

    if (
      toolPart.state === 'approval-requested' &&
      toolPart.approval?.id &&
      onToolApprove &&
      onToolDeny
    ) {
      const approvalId = toolPart.approval.id
      rendered.push(
        <ToolConfirmation
          input={toolPart.input}
          isLoading={isLoading}
          key={`tool-${i}`}
          onAllow={() => onToolApprove(approvalId)}
          onDeny={() => onToolDeny(approvalId)}
          toolName={toolName}
        />,
      )
      return
    }

    rendered.push(<ToolCallIndicator key={`tool-${i}`} part={toolPart} />)
  })
  flushText()

  if (rendered.length === 0) {
    rendered.push(
      <div key="empty" style={bubbleStyle}>
        {'\u2026'}
      </div>,
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxWidth: '85%',
          minWidth: '120px',
        }}
      >
        {rendered}
        {!isUser && meta?.totalTokens ? (
          <div style={{ color: 'var(--theme-elevation-400)', fontSize: '11px' }}>
            {[meta.model, formatTokens(meta.totalTokens)].filter(Boolean).join(' \u00b7 ')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
