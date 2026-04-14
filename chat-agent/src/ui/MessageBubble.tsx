'use client'

import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import React, { useCallback, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { formatTokens } from './format-tokens.js'
import { CheckIcon } from './icons/CheckIcon.js'
import { ClipboardIcon } from './icons/ClipboardIcon.js'
import { CopyIcon } from './icons/CopyIcon.js'
import { PencilIcon } from './icons/PencilIcon.js'
import { RetryIcon } from './icons/RetryIcon.js'
import { MarkdownContent } from './MarkdownContent.js'
import { ToolConfirmation } from './ToolConfirmation.js'

// ---------------------------------------------------------------------------
// Action button (hover-revealed)
// ---------------------------------------------------------------------------

function ActionButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      aria-label={title}
      onClick={onClick}
      style={{
        alignItems: 'center',
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '6px',
        color: 'var(--theme-elevation-500)',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        padding: '4px',
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tool call indicator (expandable with output copy)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Thinking / reasoning section
// ---------------------------------------------------------------------------

function ThinkingSection({ text }: { text: string }) {
  return (
    <details
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '6px',
      }}
    >
      <summary
        style={{
          color: 'var(--theme-elevation-500)',
          cursor: 'pointer',
          fontSize: '12px',
          padding: '6px 10px',
          userSelect: 'none',
        }}
      >
        Thinking…
      </summary>
      <div
        style={{
          borderTop: '1px solid var(--theme-elevation-150)',
          color: 'var(--theme-elevation-500)',
          fontSize: '12px',
          lineHeight: '1.5',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '8px 10px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({
  isLastAssistant,
  isLoading,
  message,
  onEdit,
  onRetry,
  onToolApprove,
  onToolDeny,
}: {
  isLastAssistant?: boolean
  isLoading?: boolean
  message: UIMessage<MessageMetadata>
  onEdit?: (newText: string) => void
  onRetry?: () => void
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
}) {
  const isUser = message.role === 'user'
  const meta = message.metadata
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const editRef = React.useRef<HTMLTextAreaElement>(null)

  // Full concatenated text (used for copy-to-clipboard and the edit flow)
  const textContent = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string; type: 'text' }).text)
    .join('')

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [textContent])

  const handleEditStart = useCallback(() => {
    setEditText(textContent)
    setIsEditing(true)
    setTimeout(() => editRef.current?.focus(), 0)
  }, [textContent])

  const handleEditSubmit = useCallback(() => {
    if (editText.trim()) {
      onEdit?.(editText.trim())
      setIsEditing(false)
    }
  }, [editText, onEdit])

  const handleEditCancel = useCallback(() => {
    setIsEditing(false)
  }, [])

  // Hover actions
  const showCopy = !isUser && textContent.length > 0
  const showRetry = !isUser && isLastAssistant && onRetry
  const showEdit = isUser && onEdit
  const hasActions = showCopy || showRetry || showEdit

  // --- Render parts in their original order ---------------------------------
  // The base renderer walks `message.parts` and interleaves text (as markdown
  // bubbles) with tool indicators / approval dialogs, so the visual order
  // matches the order the model produced them. We buffer consecutive text
  // parts and flush on tool boundaries.

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
    // Reasoning parts render as collapsible "Thinking…" sections.
    if ((part as { type: string }).type === 'reasoning') {
      flushText()
      const reasoning = (part as unknown as { reasoning: string; type: 'reasoning' }).reasoning
      rendered.push(<ThinkingSection key={`reasoning-${i}`} text={reasoning} />)
      return
    }
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
    <div
      className="chat-agent-message"
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxWidth: '85%',
          minWidth: '120px',
          position: 'relative',
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea
              aria-label="Edit message"
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleEditSubmit()
                } else if (e.key === 'Escape') {
                  handleEditCancel()
                }
              }}
              ref={editRef}
              rows={3}
              style={{
                background: 'var(--theme-input-bg, var(--theme-bg))',
                border: '1px solid var(--theme-elevation-300)',
                borderRadius: '8px',
                color: 'var(--theme-text)',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.5',
                outline: 'none',
                padding: '10px 12px',
                resize: 'vertical',
              }}
              value={editText}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleEditCancel}
                style={{
                  background: 'none',
                  border: '1px solid var(--theme-elevation-250)',
                  borderRadius: '6px',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '4px 12px',
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                disabled={!editText.trim()}
                onClick={handleEditSubmit}
                style={{
                  background: 'var(--theme-elevation-900)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--theme-bg)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '4px 12px',
                }}
                type="button"
              >
                Save & Send
              </button>
            </div>
          </div>
        ) : (
          rendered
        )}
        {!isEditing && (hasActions || (!isUser && meta?.totalTokens)) ? (
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: '8px',
              justifyContent: isUser ? 'flex-end' : 'space-between',
              minHeight: '24px',
            }}
          >
            {!isUser && meta?.totalTokens ? (
              <div style={{ color: 'var(--theme-elevation-400)', fontSize: '11px' }}>
                {[meta.model, formatTokens(meta.totalTokens)].filter(Boolean).join(' \u00b7 ')}
              </div>
            ) : null}
            {hasActions ? (
              <div
                className="chat-agent-actions"
                style={{
                  display: 'flex',
                  gap: '4px',
                  opacity: 0,
                  transition: 'opacity 150ms',
                }}
              >
                {showCopy ? (
                  <ActionButton onClick={handleCopy} title={copied ? 'Copied!' : 'Copy message'}>
                    {copied ? (
                      <CheckIcon height={14} width={14} />
                    ) : (
                      <CopyIcon height={14} width={14} />
                    )}
                  </ActionButton>
                ) : null}
                {showRetry ? (
                  <ActionButton onClick={onRetry} title="Regenerate response">
                    <RetryIcon height={14} width={14} />
                  </ActionButton>
                ) : null}
                {showEdit ? (
                  <ActionButton onClick={handleEditStart} title="Edit message">
                    <PencilIcon height={14} width={14} />
                  </ActionButton>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
