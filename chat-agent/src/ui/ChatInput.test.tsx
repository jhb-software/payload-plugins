// @vitest-environment jsdom
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Minimal prop shape consumed by the `Button` mock below — we reimplement
 * Payload's `Button` as a plain `<button>` for tests, so we only need the
 * subset of its public API that the component under test actually uses.
 */
type ButtonMockProps = {
  children?: ReactNode
  disabled?: boolean
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

vi.mock('@payloadcms/ui', () => ({
  Button: ({ type, children, disabled, onClick }: ButtonMockProps) => (
    <button disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  ),
}))

const { ChatInput } = await import('./ChatInput.js')

describe('ChatInput', () => {
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

  it('auto-focuses textarea when loading completes', () => {
    const { rerender } = render(<ChatInput isLoading={true} onSend={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    expect(document.activeElement).not.toBe(textarea)

    rerender(<ChatInput isLoading={false} onSend={vi.fn()} />)
    expect(document.activeElement).toBe(textarea)
  })

  it('sends on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('does not send on plain Enter (allows newline)', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Stop button instead of Send while loading', () => {
    const onStop = vi.fn()
    render(<ChatInput isLoading={true} onSend={vi.fn()} onStop={onStop} />)
    expect(screen.getByText(/stop/i)).toBeDefined()
    expect(screen.queryByText(/^send$/i)).toBeNull()
  })
})
