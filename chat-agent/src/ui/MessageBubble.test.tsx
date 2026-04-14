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

  it('renders assistant markdown as HTML', () => {
    const message = makeMessage({
      role: 'assistant',
      text: 'Hello **world**',
    })
    const { container } = render(<MessageBubble message={message} />)
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong!.textContent).toBe('world')
  })

  it('opens markdown links in a new tab to preserve the chat view', () => {
    const message = makeMessage({
      role: 'assistant',
      text: 'See [the post](/admin/collections/posts/123).',
    })
    const { container } = render(<MessageBubble message={message} />)
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('target')).toBe('_blank')
    expect(link!.getAttribute('rel')).toContain('noopener')
  })

  it('renders user messages as plain text without markdown', () => {
    const message = makeMessage({
      role: 'user',
      text: 'Hello **world**',
    })
    const { container } = render(<MessageBubble message={message} />)
    expect(container.querySelector('strong')).toBeNull()
    expect(screen.getByText('Hello **world**')).toBeDefined()
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

    // Click the tool call expand button (role="button" with aria-expanded)
    const toolButton = screen.getByRole('button', { expanded: false })
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
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    // Click the copy button
    const copyButton = screen.getByRole('button', { name: /copy json/i })
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(output, null, 2))
  })

  it('renders text and tool parts in their original order', () => {
    const message = {
      id: '1',
      parts: [
        { type: 'text', text: 'Let me check that.' },
        {
          type: 'dynamic-tool',
          input: { collection: 'posts' },
          output: { docs: [] },
          state: 'output-available',
          toolCallId: 'tc1',
          toolName: 'find',
        },
        { type: 'text', text: 'Found nothing.' },
      ],
      role: 'assistant',
    } as unknown as UIMessage<MessageMetadata>

    const { container } = render(<MessageBubble message={message} />)
    const text = container.textContent ?? ''
    const firstTextIdx = text.indexOf('Let me check that.')
    const toolIdx = text.indexOf('find(')
    const secondTextIdx = text.indexOf('Found nothing.')

    expect(firstTextIdx).toBeGreaterThanOrEqual(0)
    expect(toolIdx).toBeGreaterThan(firstTextIdx)
    expect(secondTextIdx).toBeGreaterThan(toolIdx)
  })

  it('does not show expand toggle for pending tool calls (only hover copy button exists)', () => {
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
    // No expandable button (only the hover copy action may exist)
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
  })
})
