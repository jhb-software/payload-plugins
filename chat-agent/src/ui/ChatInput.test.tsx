// @vitest-environment jsdom
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Prop shape consumed by the `Button` mock below — we reimplement Payload's
 * `Button` as a plain `<button>` for tests, forwarding the attributes the
 * component under test actually uses.
 */
type ButtonMockProps = {
  buttonStyle?: string
  children?: ReactNode
  size?: string
} & ButtonHTMLAttributes<HTMLButtonElement>

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    type = 'button',
    buttonStyle: _buttonStyle,
    children,
    margin: _margin,
    size: _size,
    tooltip: _tooltip,
    ...rest
  }: { margin?: boolean; tooltip?: string; type?: 'button' | 'submit' } & ButtonMockProps) => (
    <button {...rest} type={type}>
      {children}
    </button>
  ),
}))

const { ChatInput } = await import('./ChatInput.js')

/** Stub `window.matchMedia` so the component can read pointer media queries. */
const stubPointerMedia = (fine: boolean) => {
  window.matchMedia = vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query.includes('pointer: fine') ? fine : !fine,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('ChatInput', () => {
  // jsdom doesn't ship `window.matchMedia`. Default to a coarse pointer so the
  // post-load focus effect is a no-op for tests that don't care about it; the
  // pointer-specific tests below override per-case.
  beforeEach(() => stubPointerMedia(false))
  afterEach(cleanup)

  it('calls onSend with trimmed text and clears input on submit', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.submit(textarea.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('Hello')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('does not submit whitespace-only input', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.submit(textarea.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('blocks submission and disables textarea while loading', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={true} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    expect(textarea.hasAttribute('disabled')).toBe(true)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.submit(textarea.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('auto-focuses textarea when loading completes on devices with a fine pointer', () => {
    stubPointerMedia(true)
    const { rerender } = render(<ChatInput isLoading={true} onSend={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    expect(document.activeElement).not.toBe(textarea)

    rerender(<ChatInput isLoading={false} onSend={vi.fn()} />)
    expect(document.activeElement).toBe(textarea)
  })

  it('does not auto-focus textarea on touch devices (would pop the on-screen keyboard)', () => {
    stubPointerMedia(false)
    const { rerender } = render(<ChatInput isLoading={true} onSend={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)

    rerender(<ChatInput isLoading={false} onSend={vi.fn()} />)
    expect(document.activeElement).not.toBe(textarea)
  })

  it('sends on Enter', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('does not send on Shift+Enter (allows newline)', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Stop button instead of Send while loading', () => {
    const onStop = vi.fn()
    render(<ChatInput isLoading={true} onSend={vi.fn()} onStop={onStop} />)
    expect(screen.getByText(/stop/i)).toBeDefined()
    expect(screen.queryByText(/^send$/i)).toBeNull()
  })

  it('renders textarea with at least 2 rows by default', () => {
    render(<ChatInput isLoading={false} onSend={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    expect((textarea as HTMLTextAreaElement).rows).toBeGreaterThanOrEqual(2)
  })

  it('renders the send button as an icon-only button (no "Send" text)', () => {
    render(<ChatInput isLoading={false} onSend={vi.fn()} />)
    const submit = screen.getByRole('button', { name: /send/i })
    expect((submit as HTMLButtonElement).type).toBe('submit')
    expect(submit.textContent?.trim()).toBe('')
    expect(submit.querySelector('svg')).not.toBeNull()
  })

  // Regression: sending a new message while a tool-approval card is still
  // awaiting Allow / Deny poisons the conversation — the next request
  // contains an orphan `tool_use` that every subsequent request also
  // carries, and the agent errors with "Tool result is missing for tool
  // call toolu_...". Block the send at the source by disabling the
  // composer while an approval is pending, with an inline hint explaining
  // why.
  describe('pending tool approval', () => {
    it('disables the textarea and blocks submission while an approval is pending', () => {
      const onSend = vi.fn()
      render(<ChatInput isAwaitingApproval={true} isLoading={false} onSend={onSend} />)
      const textarea = screen.getByPlaceholderText(/type a message/i)
      expect(textarea.hasAttribute('disabled')).toBe(true)
      fireEvent.change(textarea, { target: { value: 'new question' } })
      fireEvent.submit(textarea.closest('form')!)
      expect(onSend).not.toHaveBeenCalled()
    })

    it('disables the send button while an approval is pending, even with draft text', () => {
      render(<ChatInput isAwaitingApproval={true} isLoading={false} onSend={vi.fn()} />)
      const submit = screen.getByRole('button', { name: /send/i })
      expect((submit as HTMLButtonElement).disabled).toBe(true)
    })

    it('surfaces a hint telling the user to approve or deny the pending tool call', () => {
      render(<ChatInput isAwaitingApproval={true} isLoading={false} onSend={vi.fn()} />)
      expect(screen.getByText(/approve or deny/i)).toBeDefined()
    })

    it('does not show the pending-approval hint when no approval is pending', () => {
      render(<ChatInput isLoading={false} onSend={vi.fn()} />)
      expect(screen.queryByText(/approve or deny/i)).toBeNull()
    })

    it('re-enables the composer once the approval is resolved', () => {
      const onSend = vi.fn()
      const { rerender } = render(
        <ChatInput isAwaitingApproval={true} isLoading={false} onSend={onSend} />,
      )
      const textarea = screen.getByPlaceholderText(/type a message/i)
      expect(textarea.hasAttribute('disabled')).toBe(true)

      rerender(<ChatInput isAwaitingApproval={false} isLoading={false} onSend={onSend} />)
      expect(textarea.hasAttribute('disabled')).toBe(false)
      fireEvent.change(textarea, { target: { value: 'now i can send' } })
      fireEvent.submit(textarea.closest('form')!)
      expect(onSend).toHaveBeenCalledWith('now i can send')
    })
  })
})
