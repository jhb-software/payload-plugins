// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { MessageBubble } from './MessageBubble.js'

function makeMessage(
  overrides: Partial<UIMessage<MessageMetadata>> & { text?: string },
): UIMessage<MessageMetadata> {
  const { text = 'Hello', ...rest } = overrides
  return {
    id: '1',
    parts: [{ text, type: 'text' as const }],
    role: 'user',
    ...rest,
  } as UIMessage<MessageMetadata>
}

describe('MessageBubble', () => {
  afterEach(cleanup)

  it('renders text content', () => {
    render(<MessageBubble message={makeMessage({ text: 'Test message' })} />)
    expect(screen.getByText('Test message')).toBeDefined()
  })

  it('aligns user messages to the right', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.justifyContent).toBe('flex-end')
  })

  it('aligns assistant messages to the left', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'assistant' })} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.justifyContent).toBe('flex-start')
  })

  it('shows token count for assistant messages with metadata', () => {
    const message = makeMessage({
      metadata: { totalTokens: 1500 },
      role: 'assistant',
    })
    render(<MessageBubble message={message} />)
    expect(screen.getByText(/1\.5k/)).toBeDefined()
  })

  it('shows model name in metadata', () => {
    const message = makeMessage({
      metadata: { model: 'claude-sonnet-4-20250514', totalTokens: 500 },
      role: 'assistant',
    })
    render(<MessageBubble message={message} />)
    expect(screen.getByText(/claude-sonnet-4-20250514/)).toBeDefined()
  })

  it('does not show metadata for user messages', () => {
    const message = makeMessage({
      metadata: { totalTokens: 500 },
      role: 'user',
    })
    const { container } = render(<MessageBubble message={message} />)
    expect(container.textContent).not.toContain('500')
  })

  it('renders ellipsis when message has no text parts', () => {
    const message = {
      id: '1',
      parts: [],
      role: 'assistant',
    } as unknown as UIMessage<MessageMetadata>
    render(<MessageBubble message={message} />)
    expect(screen.getByText('\u2026')).toBeDefined()
  })
})
