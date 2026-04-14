// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ type, children, disabled }: any) => (
    <button disabled={disabled} type={type}>
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
    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('Hello')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('does not submit whitespace-only input', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('blocks submission and disables input while loading', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={true} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    expect(input.hasAttribute('disabled')).toBe(true)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('auto-focuses input when loading completes', () => {
    const { rerender } = render(<ChatInput isLoading={true} onSend={vi.fn()} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    expect(document.activeElement).not.toBe(input)

    rerender(<ChatInput isLoading={false} onSend={vi.fn()} />)
    expect(document.activeElement).toBe(input)
  })
})
