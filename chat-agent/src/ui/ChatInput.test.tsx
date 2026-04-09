// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, type }: any) => (
    <button disabled={disabled} type={type}>
      {children}
    </button>
  ),
}))

const { ChatInput } = await import('./ChatInput.js')

describe('ChatInput', () => {
  afterEach(cleanup)

  it('renders an input and a send button', () => {
    render(<ChatInput isLoading={false} onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText(/type a message/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })

  it('disables the button when input is empty', () => {
    render(<ChatInput isLoading={false} onSend={vi.fn()} />)
    const button = screen.getByRole('button', { name: /send/i })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('enables the button when text is entered', () => {
    render(<ChatInput isLoading={false} onSend={vi.fn()} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    const button = screen.getByRole('button', { name: /send/i })
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('calls onSend and clears input on submit', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('Hello')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('does not call onSend with only whitespace', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={false} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input and shows loading text when isLoading', () => {
    render(<ChatInput isLoading={true} onSend={vi.fn()} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    expect(input.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button').textContent).toContain('Sending')
  })

  it('does not submit while loading even with text', () => {
    const onSend = vi.fn()
    render(<ChatInput isLoading={true} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/type a message/i)
    // Simulate the value being present before loading started
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
  })
})
