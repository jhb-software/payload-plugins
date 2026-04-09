'use client'

import type { UIMessage } from 'ai'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { ChevronDownIcon } from './icons/ChevronDownIcon.js'
import { MessageBubble } from './MessageBubble.js'

// ---------------------------------------------------------------------------
// Suggested prompts (empty state)
// ---------------------------------------------------------------------------

const defaultSuggestions = [
  'Show me the 5 most recent posts',
  'Create a new draft post',
  'Find and fix any pages with an empty meta description',
]

function SuggestedPrompts({
  onSelect,
  suggestions,
}: {
  onSelect: (text: string) => void
  suggestions: string[]
}) {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          color: 'var(--theme-elevation-500)',
          fontSize: '16px',
          fontWeight: 500,
          marginBottom: '20px',
        }}
      >
        What can I help you with?
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          maxWidth: '480px',
        }}
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSelect(suggestion)}
            style={{
              background: 'var(--theme-elevation-50)',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: '20px',
              color: 'var(--theme-text)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '8px 16px',
              transition: 'background 150ms, border-color 150ms',
            }}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

export function MessageList({
  isLoading,
  messages,
  onEditMessage,
  onRetry,
  onSendSuggestion,
  onToolApprove,
  onToolDeny,
  suggestedPrompts,
}: {
  isLoading?: boolean
  messages: UIMessage<MessageMetadata>[]
  onEditMessage?: (messageId: string, newText: string) => void
  onRetry?: () => void
  onSendSuggestion?: (text: string) => void
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
  suggestedPrompts?: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Find the last assistant message index for retry action visibility
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i
      break
    }
  }

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const threshold = 40
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setIsAtBottom(atBottom)
  }, [])

  // Auto-scroll when new messages arrive (only if the user is at the bottom)
  useEffect(() => {
    if (isAtBottom) {
      const el = containerRef.current
      if (el) {
        el.scrollTo({ behavior: 'smooth', top: el.scrollHeight })
      }
    }
  }, [messages, isAtBottom])

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTo({ behavior: 'smooth', top: el.scrollHeight })
      setIsAtBottom(true)
    }
  }, [])

  if (messages.length === 0) {
    return (
      <SuggestedPrompts
        onSelect={onSendSuggestion ?? (() => {})}
        suggestions={suggestedPrompts?.length ? suggestedPrompts : defaultSuggestions}
      />
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {/* Hover reveal style for message actions */}
      <style>{`
        .chat-agent-message:hover .chat-agent-actions {
          opacity: 1 !important;
        }
      `}</style>
      <div
        onScroll={handleScroll}
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          height: '100%',
          overflowY: 'auto',
          paddingBottom: '8px',
          paddingRight: '4px',
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble
            isLastAssistant={i === lastAssistantIndex}
            isLoading={isLoading}
            key={msg.id}
            message={msg}
            onEdit={
              msg.role === 'user' && onEditMessage
                ? (newText: string) => onEditMessage(msg.id, newText)
                : undefined
            }
            onRetry={i === lastAssistantIndex ? onRetry : undefined}
            onToolApprove={onToolApprove}
            onToolDeny={onToolDeny}
          />
        ))}
      </div>

      {/* Scroll-to-bottom FAB */}
      {!isAtBottom ? (
        <button
          aria-label="Scroll to bottom"
          onClick={scrollToBottom}
          style={{
            alignItems: 'center',
            background: 'var(--theme-bg)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '50%',
            bottom: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            display: 'flex',
            height: '36px',
            justifyContent: 'center',
            left: '50%',
            position: 'absolute',
            transform: 'translateX(-50%)',
            transition: 'box-shadow 150ms',
            width: '36px',
          }}
          title="Scroll to bottom"
          type="button"
        >
          <ChevronDownIcon height={16} width={16} />
        </button>
      ) : null}
    </div>
  )
}
