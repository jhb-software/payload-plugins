// @vitest-environment jsdom
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type ButtonMockProps = {
  children?: ReactNode
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  tooltip?: string
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

vi.mock('@payloadcms/ui', () => ({
  Button: ({ type, children, disabled, onClick, tooltip }: ButtonMockProps) => (
    <button aria-label={tooltip} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  ),
  FieldLabel: ({ label }: { label?: ReactNode }) => <span>{label}</span>,
  ReactSelect: () => <div data-testid="react-select" />,
}))

const { ChatHeader } = await import('./ChatHeader.js')

const baseProps = {
  availableModels: [],
  availableModes: ['ask' as const],
  canRename: true,
  disabled: false,
  messages: [],
  mode: 'ask' as const,
  onModeChange: () => {},
  onModelChange: () => {},
  onRename: () => {},
  selectedModel: undefined,
  title: 'My chat',
}

describe('ChatHeader', () => {
  afterEach(cleanup)

  it('shows the title prop when not editing', () => {
    render(<ChatHeader {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'My chat' })).toBeDefined()
    expect(screen.queryByRole('textbox', { name: /rename/i })).toBeNull()
  })

  it('clicking the rename button reveals an input pre-filled with the title', () => {
    render(<ChatHeader {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /rename/i })
    expect(input.value).toBe('My chat')
  })

  it('commits the new title on Enter and exits edit mode', () => {
    const onRename = vi.fn()
    render(<ChatHeader {...baseProps} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    const input = screen.getByRole('textbox', { name: /rename/i })
    fireEvent.change(input, { target: { value: '  Renamed  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Renamed')
    expect(screen.queryByRole('textbox', { name: /rename/i })).toBeNull()
  })

  it('commits the new title on blur', () => {
    const onRename = vi.fn()
    render(<ChatHeader {...baseProps} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    const input = screen.getByRole('textbox', { name: /rename/i })
    fireEvent.change(input, { target: { value: 'Via blur' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('Via blur')
  })

  it('does not call onRename when Escape cancels the edit', () => {
    const onRename = vi.fn()
    render(<ChatHeader {...baseProps} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    const input = screen.getByRole('textbox', { name: /rename/i })
    fireEvent.change(input, { target: { value: 'abandoned' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /rename/i })).toBeNull()
  })

  it('falls back to "New conversation" when the trimmed title is empty', () => {
    const onRename = vi.fn()
    render(<ChatHeader {...baseProps} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    const input = screen.getByRole('textbox', { name: /rename/i })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('New conversation')
  })

  it('disables the rename button when canRename is false', () => {
    render(<ChatHeader {...baseProps} canRename={false} />)
    const renameButton = screen.getByRole('button', { name: /rename/i })
    expect(renameButton).toHaveProperty('disabled', true)
    fireEvent.click(renameButton)
    expect(screen.queryByRole('textbox', { name: /rename/i })).toBeNull()
  })

  it('renders a compact summary listing mode, model, and tokens — collapsed by default', () => {
    render(
      <ChatHeader
        {...baseProps}
        availableModels={[
          { id: 'gpt-4', label: 'GPT-4' },
          { id: 'gpt-5', label: 'GPT-5' },
        ]}
        availableModes={['ask', 'read']}
        messages={
          [{ id: 'm1', metadata: { totalTokens: 1500 }, parts: [], role: 'assistant' }] as never
        }
        mode="ask"
        selectedModel="gpt-4"
      />,
    )
    const summary = screen.getByRole('button', { name: /settings/i })
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    expect(summary.textContent).toMatch(/confirm writes/i)
    expect(summary.textContent).toMatch(/gpt-4/i)
    expect(summary.textContent).toMatch(/1\.5k/)
  })

  it('toggles aria-expanded on the settings summary when clicked', () => {
    render(
      <ChatHeader
        {...baseProps}
        availableModels={[
          { id: 'gpt-4', label: 'GPT-4' },
          { id: 'gpt-5', label: 'GPT-5' },
        ]}
        availableModes={['ask', 'read']}
      />,
    )
    const summary = screen.getByRole('button', { name: /settings/i })
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(summary)
    expect(summary.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(summary)
    expect(summary.getAttribute('aria-expanded')).toBe('false')
  })
})
