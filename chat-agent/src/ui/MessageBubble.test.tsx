// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { MessageBubble } from './MessageBubble.js'

function makeMessage(
  overrides: { text?: string } & Partial<UIMessage<MessageMetadata>>,
): UIMessage<MessageMetadata> {
  const { text = 'Hello', ...rest } = overrides
  return {
    id: '1',
    parts: [{ type: 'text' as const, text }],
    role: 'user',
    ...rest,
  } as UIMessage<MessageMetadata>
}

describe('MessageBubble', () => {
  afterEach(cleanup)

  it('shows model and token metadata only for assistant messages', () => {
    const meta = { model: 'claude-sonnet-4-20250514', totalTokens: 1500 }

    const { container: userContainer } = render(
      <MessageBubble message={makeMessage({ metadata: meta, role: 'user' })} />,
    )
    expect(userContainer.textContent).not.toContain('claude-sonnet')
    expect(userContainer.textContent).not.toContain('1.5k')
    cleanup()

    render(<MessageBubble message={makeMessage({ metadata: meta, role: 'assistant' })} />)
    expect(screen.getByText(/claude-sonnet-4-20250514/)).toBeDefined()
    expect(screen.getByText(/1\.5k/)).toBeDefined()
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

  it('expands tool call output on click and collapses on second click', () => {
    const message = {
      id: '1',
      parts: [
        { type: 'text', text: 'Let me look that up.' },
        {
          type: 'dynamic-tool',
          input: { collection: 'posts' },
          output: { docs: [{ id: '1', title: 'Hello World' }] },
          state: 'output-available',
          toolCallId: 'tc1',
          toolName: 'find',
        },
      ],
      role: 'assistant',
    } as unknown as UIMessage<MessageMetadata>

    render(<MessageBubble message={message} />)

    // Output is hidden initially
    expect(screen.queryByText(/Hello World/)).toBeNull()

    // Click to expand
    const toolButton = screen.getByRole('button')
    fireEvent.click(toolButton)
    expect(screen.getByText(/Hello World/)).toBeDefined()

    // Click to collapse
    fireEvent.click(toolButton)
    expect(screen.queryByText(/Hello World/)).toBeNull()
  })

  it('copies tool output JSON to clipboard when copy button is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const output = { docs: [{ id: '1', title: 'Hello World' }] }
    const message = {
      id: '1',
      parts: [
        { type: 'text', text: 'Result:' },
        {
          type: 'dynamic-tool',
          input: { collection: 'posts' },
          output,
          state: 'output-available',
          toolCallId: 'tc1',
          toolName: 'find',
        },
      ],
      role: 'assistant',
    } as unknown as UIMessage<MessageMetadata>

    render(<MessageBubble message={message} />)

    // Expand the tool call
    fireEvent.click(screen.getByRole('button', { name: undefined }))

    // Click the copy button
    const copyButton = screen.getByRole('button', { name: /copy json/i })
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(output, null, 2))
  })

  it('does not show expand toggle for pending tool calls', () => {
    const message = {
      id: '1',
      parts: [
        {
          type: 'dynamic-tool',
          input: { collection: 'posts' },
          state: 'input-available',
          toolCallId: 'tc1',
          toolName: 'find',
        },
      ],
      role: 'assistant',
    } as unknown as UIMessage<MessageMetadata>

    render(<MessageBubble message={message} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
