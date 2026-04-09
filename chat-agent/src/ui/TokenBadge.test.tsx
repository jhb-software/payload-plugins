// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { TokenBadge } from './TokenBadge.js'

function makeMessage(meta?: MessageMetadata): UIMessage<MessageMetadata> {
  return {
    id: Math.random().toString(),
    metadata: meta,
    parts: [{ text: 'hi', type: 'text' as const }],
    role: 'assistant',
  } as UIMessage<MessageMetadata>
}

describe('TokenBadge', () => {
  afterEach(cleanup)

  it('renders nothing when total tokens is zero', () => {
    const { container } = render(<TokenBadge messages={[makeMessage()]} />)
    expect(container.textContent).toBe('')
  })

  it('sums tokens across messages, skipping those without metadata', () => {
    const messages = [
      makeMessage({ totalTokens: 1000 }),
      makeMessage(), // no metadata
      makeMessage({ totalTokens: 2500 }),
    ]
    render(<TokenBadge messages={messages} />)
    expect(screen.getByText(/3\.5k tokens/)).toBeDefined()
  })
})
