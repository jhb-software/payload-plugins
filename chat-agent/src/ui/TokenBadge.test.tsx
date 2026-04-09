// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { TokenBadge } from './TokenBadge.js'

function makeMessage(
  meta?: MessageMetadata,
  role: 'assistant' | 'user' = 'assistant',
): UIMessage<MessageMetadata> {
  return {
    id: Math.random().toString(),
    metadata: meta,
    parts: [{ text: 'hi', type: 'text' as const }],
    role,
  } as UIMessage<MessageMetadata>
}

describe('TokenBadge', () => {
  afterEach(cleanup)

  it('renders nothing when no messages have tokens', () => {
    const { container } = render(<TokenBadge messages={[makeMessage()]} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing for empty messages array', () => {
    const { container } = render(<TokenBadge messages={[]} />)
    expect(container.textContent).toBe('')
  })

  it('sums tokens across messages', () => {
    const messages = [
      makeMessage({ totalTokens: 1000 }),
      makeMessage({ totalTokens: 2000 }),
      makeMessage({ totalTokens: 500 }),
    ]
    render(<TokenBadge messages={messages} />)
    expect(screen.getByText(/3\.5k tokens/)).toBeDefined()
  })

  it('skips messages without metadata', () => {
    const messages = [makeMessage({ totalTokens: 5000 }), makeMessage()]
    render(<TokenBadge messages={messages} />)
    expect(screen.getByText(/5\.0k tokens/)).toBeDefined()
  })
})
