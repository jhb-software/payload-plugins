'use client'

import type { UIMessage } from 'ai'

import { Button, ShimmerEffect } from '@payloadcms/ui'
import { useLayoutEffect, useRef, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { useScrollToBottom } from './hooks/useScrollToBottom.js'
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
          <Button
            buttonStyle="pill"
            key={suggestion}
            margin={false}
            onClick={() => onSelect(suggestion)}
            size="small"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Response indicator + skeleton
// ---------------------------------------------------------------------------

/**
 * Bubble-shaped placeholder shown while the agent is working but hasn't yet
 * produced visible output — i.e. between the user sending a message and the
 * first streamed assistant chunk arriving, or between tool steps. Matches the
 * assistant bubble styling so it reads as a pending response.
 *
 * Deliberately labelled "Responding" (not "Thinking") to avoid conflating with
 * the collapsible reasoning / thinking sections rendered in `MessageBubble`,
 * which surface actual reasoning tokens from the model.
 */
function ResponseIndicator() {
  return (
    <div
      aria-label="Assistant is responding"
      role="status"
      style={{ display: 'flex', justifyContent: 'flex-start' }}
    >
      <ShimmerEffect height="40px" width="200px" />
    </div>
  )
}

/**
 * Skeleton shown while the conversation history is being fetched (initial
 * hydration pin-to-bottom, or switching conversations from the sidebar).
 * Renders a handful of shimmer bubbles alternating user/assistant so the
 * layout matches what's about to appear.
 */
function MessageSkeleton() {
  const rows: { align: 'flex-end' | 'flex-start'; width: string }[] = [
    { align: 'flex-end', width: '55%' },
    { align: 'flex-start', width: '80%' },
    { align: 'flex-end', width: '40%' },
    { align: 'flex-start', width: '70%' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100%',
        paddingTop: '16px',
      }}
    >
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: row.align }}>
          <ShimmerEffect height={i % 2 === 0 ? '40px' : '72px'} width={row.width} />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

export function MessageList({
  isLoading,
  isLoadingMessages,
  messages,
  onEditMessage,
  onRetry,
  onSendSuggestion,
  onToolApprove,
  onToolDeny,
  suggestedPrompts,
}: {
  isLoading?: boolean
  /** Conversation messages are being fetched (initial load or sidebar switch). */
  isLoadingMessages?: boolean
  messages: UIMessage<MessageMetadata>[]
  onEditMessage?: (messageId: string, newText: string) => void
  onRetry?: () => void
  onSendSuggestion?: (text: string) => void
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
  suggestedPrompts?: string[]
}) {
  const { containerRef, isAtBottom, scrollToBottom } = useScrollToBottom()
  const hasPinnedInitialRef = useRef(false)
  const [isInitialPinned, setIsInitialPinned] = useState(false)

  // On reload of an existing conversation the server streams the message HTML
  // into the page, so the browser's *first paint* (~1.4s in on a cold admin
  // load) shows the full list — but scrolled to the top, because `scrollTop`
  // isn't something SSR can control. React doesn't hydrate and fire
  // `useLayoutEffect` until hundreds of milliseconds later, so without
  // intervention the user sees the top of the conversation briefly, then the
  // pin-to-bottom happens and reads as a visible jump.
  //
  // To eliminate that, keep the scroll container hidden until the initial
  // pin has happened; the `MessageSkeleton` shimmer is rendered on top in
  // the meantime (see `showSkeleton` below) so the hidden window reads as
  // "loading" rather than a blank area.
  //
  // We depend on `messages.length` (not `[]`) because on conversation reload
  // the component mounts with zero messages (the data is fetched async), then
  // re-renders with the real list — if we only ran once on mount the
  // container ref would still be null and the pin would be a no-op.
  useLayoutEffect(() => {
    if (hasPinnedInitialRef.current) {
      return
    }
    const el = containerRef.current
    if (el && messages.length > 0) {
      el.scrollTop = el.scrollHeight
      hasPinnedInitialRef.current = true
      setIsInitialPinned(true)
    }
  }, [messages.length, containerRef])

  // Find the last assistant message index for retry action visibility
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i
      break
    }
  }

  // Editing is only offered on the *last* user message. Editing an earlier
  // message would require truncating the assistant replies (and any
  // user/assistant turns) that came after it, which is surprising — so we
  // restrict the action to the final user turn, where it behaves like a
  // "retry with different wording".
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }

  // Only short-circuit to the empty state once we're sure there's nothing to
  // load — otherwise the user would see "What can I help you with?" flash
  // between clicking a conversation and its messages arriving.
  if (messages.length === 0 && !isLoadingMessages) {
    return (
      <SuggestedPrompts
        onSelect={onSendSuggestion ?? (() => {})}
        suggestions={suggestedPrompts?.length ? suggestedPrompts : defaultSuggestions}
      />
    )
  }

  // Show the response indicator only while the agent is working *and* the
  // latest visible turn is the user's, i.e. no assistant chunk has streamed in
  // yet. Once an assistant part arrives the message bubble itself (with its
  // own streaming text / tool indicators) takes over.
  const lastRole = messages[messages.length - 1]?.role
  const showResponseIndicator = Boolean(isLoading) && lastRole === 'user'

  // Skeleton covers both the async fetch for a selected conversation and the
  // brief window between first paint and React hydration's pin-to-bottom.
  const showSkeleton = Boolean(isLoadingMessages) || (!isInitialPinned && messages.length > 0)

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {/* Hover reveal style for message actions */}
      <style>{`
        .chat-agent-message:hover .chat-agent-actions {
          opacity: 1 !important;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          height: '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          paddingBottom: '8px',
          paddingRight: '4px',
          paddingTop: '16px',
          visibility: showSkeleton ? 'hidden' : 'visible',
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble
            isLastAssistant={i === lastAssistantIndex}
            isLoading={isLoading}
            key={msg.id}
            message={msg}
            onEdit={
              i === lastUserIndex && onEditMessage
                ? (newText: string) => onEditMessage(msg.id, newText)
                : undefined
            }
            onRetry={i === lastAssistantIndex ? onRetry : undefined}
            onToolApprove={onToolApprove}
            onToolDeny={onToolDeny}
          />
        ))}
        {showResponseIndicator ? <ResponseIndicator /> : null}
      </div>

      {/* Skeleton shown during the hidden window between first paint and
       * React hydration's initial pin-to-bottom, and while a sidebar
       * conversation switch is fetching. Replaces what would otherwise be a
       * blank area (or a scroll-from-top jump). */}
      {showSkeleton ? (
        <div
          aria-hidden
          style={{ inset: 0, position: 'absolute' }}
        >
          <MessageSkeleton />
        </div>
      ) : null}

      {/* Scroll-to-bottom FAB — centered pill above the input */}
      {!isAtBottom ? (
        <div
          style={{
            bottom: '8px',
            left: '50%',
            position: 'absolute',
            transform: 'translateX(-50%)',
          }}
        >
          <Button
            aria-label="Scroll to bottom"
            buttonStyle="subtle"
            margin={false}
            onClick={() => scrollToBottom()}
            round
            size="small"
            tooltip="Scroll to bottom"
          >
            <ChevronDownIcon height={16} width={16} />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
