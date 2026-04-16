import type { UIMessage } from 'ai'

import type { MessageMetadata } from '../types.js'

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  return String(n)
}

export function sumTokens(messages: UIMessage<MessageMetadata>[]): number {
  let total = 0
  for (const msg of messages) {
    if (msg.metadata?.totalTokens) {
      total += msg.metadata.totalTokens
    }
  }
  return total
}
