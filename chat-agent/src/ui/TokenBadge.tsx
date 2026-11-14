'use client'

import type { UIMessage } from 'ai'

import { FieldLabel } from '@payloadcms/ui'

import type { MessageMetadata } from '../types.js'

import { formatTokens, sumTokens } from './format-tokens.js'

export function TokenBadge({ messages }: { messages: UIMessage<MessageMetadata>[] }) {
  const total = sumTokens(messages)
  if (total === 0) {
    return null
  }
  return (
    <div className="chat-agent-token-badge">
      <FieldLabel label="Tokens spent" />
      <span style={{ color: 'var(--theme-text)', fontSize: '13px', lineHeight: '28px' }}>
        {formatTokens(total)}
      </span>
    </div>
  )
}
