// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { MessageList } from './MessageList.js'

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
})
