// @vitest-environment jsdom
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Subset of Payload's `Button` props exercised by the Sidebar tests. */
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
}))

const { Sidebar } = await import('./Sidebar.js')

const conversations = [
  { id: 'c1', title: 'First chat', updatedAt: '2025-01-01' },
  { id: 'c2', title: 'Second chat', updatedAt: '2025-01-02' },
]

describe('Sidebar', () => {
  afterEach(cleanup)

  it('calls onLoad when a conversation is clicked or activated via keyboard', () => {
    const onLoad = vi.fn()
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={onLoad}
      />,
    )
    fireEvent.click(screen.getByText('First chat'))
    expect(onLoad).toHaveBeenCalledWith('c1')

    const item = screen.getByText('Second chat').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onLoad).toHaveBeenCalledWith('c2')
  })

  it('confirms before deleting and does not bubble click to onLoad', () => {
    const onDelete = vi.fn()
    const onLoad = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={onDelete}
        onLoad={onLoad}
      />,
    )
    const deleteButtons = screen.getAllByRole('button', { name: /delete conversation/i })
    fireEvent.click(deleteButtons[0])
    expect(window.confirm).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith('c1')
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('does not delete when confirm is cancelled', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={onDelete}
        onLoad={vi.fn()}
      />,
    )
    const deleteButtons = screen.getAllByRole('button', { name: /delete conversation/i })
    fireEvent.click(deleteButtons[0])
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('filters conversations by search query', () => {
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={vi.fn()}
      />,
    )
    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'First' } })
    expect(screen.getByText('First chat')).toBeDefined()
    expect(screen.queryByText('Second chat')).toBeNull()
  })

  it('shows "No conversations found" when search has no results', () => {
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={vi.fn()}
      />,
    )
    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'zzzzzzz' } })
    expect(screen.getByText(/no conversations found/i)).toBeDefined()
  })

  it('calls onClose when a conversation is loaded (so the mobile drawer can close)', () => {
    const onClose = vi.fn()
    const onLoad = vi.fn()
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onClose={onClose}
        onDelete={vi.fn()}
        onLoad={onLoad}
      />,
    )
    fireEvent.click(screen.getByText('First chat'))
    expect(onLoad).toHaveBeenCalledWith('c1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not throw when a conversation is loaded without an onClose handler', () => {
    const onLoad = vi.fn()
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={onLoad}
      />,
    )
    expect(() => fireEvent.click(screen.getByText('First chat'))).not.toThrow()
    expect(onLoad).toHaveBeenCalledWith('c1')
  })

  it('applies the className prop on the root element (so ChatView can toggle the drawer open state)', () => {
    const { container } = render(
      <Sidebar
        chatId={undefined}
        className="chat-agent-sidebar--open"
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={vi.fn()}
      />,
    )
    const root = container.querySelector('.chat-agent-sidebar')!
    expect(root.className).toContain('chat-agent-sidebar--open')
  })
})
