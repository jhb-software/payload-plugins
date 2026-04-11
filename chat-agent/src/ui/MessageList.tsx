'use client'

import type { UIMessage } from 'ai'
import type React from 'react'

import type { MessageMetadata } from '../types.js'

import { MessageBubble } from './MessageBubble.js'

export function MessageList({
  isLoading,
  messages,
  onToolApprove,
  onToolDeny,
  scrollRef,
}: {
  isLoading?: boolean
  messages: UIMessage<MessageMetadata>[]
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  if (messages.length === 0) {
    return (
      <div
        style={{
          alignItems: 'center',
          color: 'var(--theme-elevation-400)',
          display: 'flex',
          flex: 1,
          fontSize: '15px',
          justifyContent: 'center',
        }}
      >
        Ask me anything about your content.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto',
      }}
    >
      {messages.map((msg) => (
        <MessageBubble
          isLoading={isLoading}
          key={msg.id}
          message={msg}
          onToolApprove={onToolApprove}
          onToolDeny={onToolDeny}
        />
      ))}
      <div ref={scrollRef} />
    </div>
  )
}
