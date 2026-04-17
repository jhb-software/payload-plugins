// @vitest-environment jsdom
import type { UIMessage } from 'ai'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { MessageMetadata } from '../types.js'

// Reimplement Payload's `Button` as a plain `<button>` so tests don't depend
// on the full @payloadcms/ui tooltip/observer machinery.
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    type = 'button',
    buttonStyle: _buttonStyle,
    children,
    margin: _margin,
    round: _round,
    size: _size,
    tooltip,
    ...rest
  }: {
    buttonStyle?: string
    children?: ReactNode
    margin?: boolean
    round?: boolean
    size?: string
    tooltip?: string
    type?: 'button' | 'submit'
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest} title={rest.title ?? tooltip} type={type}>
      {children}
    </button>
  ),
}))

const { MessageList } = await import('./MessageList.js')

beforeAll(() => {
  // jsdom doesn't support scrollTo
  Element.prototype.scrollTo = vi.fn()
})

describe('MessageList', () => {
  afterEach(cleanup)

  it('shows suggested prompts when there are no messages', () => {
    render(<MessageList messages={[]} />)
    expect(screen.getByText(/what can i help you with/i)).toBeDefined()
    expect(screen.getByText('Show me the 5 most recent posts')).toBeDefined()
  })

  it('calls onSendSuggestion when a suggested prompt is clicked', () => {
    const onSendSuggestion = vi.fn()
    render(<MessageList messages={[]} onSendSuggestion={onSendSuggestion} />)
    fireEvent.click(screen.getByText('Show me the 5 most recent posts'))
    expect(onSendSuggestion).toHaveBeenCalledWith('Show me the 5 most recent posts')
  })

  it('shows messages and hides empty state when messages exist', () => {
    const message = {
      id: '1',
      parts: [{ type: 'text' as const, text: 'Hi' }],
      role: 'user',
    } as UIMessage<MessageMetadata>
    render(<MessageList messages={[message]} />)
    expect(screen.queryByText(/what can i help you with/i)).toBeNull()
    expect(screen.getByText('Hi')).toBeDefined()
  })

  it('shows a thinking indicator while the agent is responding to the most recent user message', () => {
    const message = {
      id: '1',
      parts: [{ type: 'text' as const, text: 'Hi' }],
      role: 'user',
    } as UIMessage<MessageMetadata>
    render(<MessageList isLoading messages={[message]} />)
    expect(screen.getByRole('status', { name: /assistant is responding/i })).toBeDefined()
  })

  it('hides the thinking indicator once an assistant message has started streaming', () => {
    const messages = [
      {
        id: '1',
        parts: [{ type: 'text' as const, text: 'Hi' }],
        role: 'user',
      },
      {
        id: '2',
        parts: [{ type: 'text' as const, text: 'Streaming…' }],
        role: 'assistant',
      },
    ] as UIMessage<MessageMetadata>[]
    render(<MessageList isLoading messages={messages} />)
    expect(screen.queryByRole('status', { name: /assistant is responding/i })).toBeNull()
  })

  it('does not show a thinking indicator when the chat is idle', () => {
    const message = {
      id: '1',
      parts: [{ type: 'text' as const, text: 'Hi' }],
      role: 'user',
    } as UIMessage<MessageMetadata>
    render(<MessageList messages={[message]} />)
    expect(screen.queryByRole('status', { name: /assistant is responding/i })).toBeNull()
  })

  it('only exposes the edit action on the last user message', () => {
    const messages = [
      {
        id: '1',
        parts: [{ type: 'text' as const, text: 'first user' }],
        role: 'user',
      },
      {
        id: '2',
        parts: [{ type: 'text' as const, text: 'assistant reply' }],
        role: 'assistant',
      },
      {
        id: '3',
        parts: [{ type: 'text' as const, text: 'second user' }],
        role: 'user',
      },
      {
        id: '4',
        parts: [{ type: 'text' as const, text: 'assistant follow-up' }],
        role: 'assistant',
      },
    ] as UIMessage<MessageMetadata>[]
    render(<MessageList messages={messages} onEditMessage={vi.fn()} />)
    const editButtons = screen.getAllByTitle(/edit message/i)
    expect(editButtons).toHaveLength(1)
  })
})
