'use client'

import type { UIMessage } from 'ai'
import type React from 'react'

import type { AgentMode, MessageMetadata } from '../types.js'

import { MessageBubble } from './MessageBubble.js'

export function MessageList({
  executingTools,
  messages,
  mode,
  onToolAllow,
  onToolDeny,
  scrollRef,
}: {
  executingTools?: Set<string>
  messages: UIMessage<MessageMetadata>[]
  mode?: AgentMode
  onToolAllow?: (toolCallId: string, toolName: string, input: unknown) => void
  onToolDeny?: (toolCallId: string) => void
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
          executingTools={executingTools}
          key={msg.id}
          message={msg}
          mode={mode}
          onToolAllow={onToolAllow}
          onToolDeny={onToolDeny}
        />
      ))}
      <div ref={scrollRef} />
    </div>
  )
}
