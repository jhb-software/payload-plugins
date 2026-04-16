'use client'

import type { UIMessage } from 'ai'

import { FieldLabel } from '@payloadcms/ui'

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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FieldLabel label="Tokens spent" />
      <span style={{ color: 'var(--theme-text)', fontSize: '13px', lineHeight: '28px' }}>
        {formatTokens(total)}
      </span>
    </div>
  )
}
