'use client'

import type { UIMessage } from 'ai'

import type { MessageMetadata } from '../types.js'

import { formatTokens } from './format-tokens.js'

export function TokenBadge({ messages }: { messages: UIMessage<MessageMetadata>[] }) {
  let total = 0
  for (const msg of messages) {
    const meta = msg.metadata
    if (meta?.totalTokens) {
      total += meta.totalTokens
    }
  }
  if (total === 0) {
    return null
  }
  return (
    <span style={{ color: 'var(--theme-elevation-400)', fontSize: '12px', fontWeight: 400 }}>
      {formatTokens(total)} tokens
    </span>
  )
}
