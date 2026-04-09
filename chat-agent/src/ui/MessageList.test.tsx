// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { MessageList } from './MessageList.js'

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

describe('MessageList', () => {
  afterEach(cleanup)

  it('shows empty state when there are no messages', () => {
    const ref = createRef<HTMLDivElement>()
    render(<MessageList messages={[]} scrollRef={ref} />)
    expect(screen.getByText(/ask me anything/i)).toBeDefined()
  })

  it('renders messages when provided', () => {
    const ref = createRef<HTMLDivElement>()
    const messages = [
      makeMessage({ id: '1', text: 'Hi there' }),
      makeMessage({ id: '2', role: 'assistant', text: 'Hello!' }),
    ]
    render(<MessageList messages={messages} scrollRef={ref} />)
    expect(screen.getByText('Hi there')).toBeDefined()
    expect(screen.getByText('Hello!')).toBeDefined()
  })

  it('does not show empty state when messages exist', () => {
    const ref = createRef<HTMLDivElement>()
    render(<MessageList messages={[makeMessage({})]} scrollRef={ref} />)
    expect(screen.queryByText(/ask me anything/i)).toBeNull()
  })
})
