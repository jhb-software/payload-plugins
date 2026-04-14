// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ type, children, disabled, onClick, tooltip }: any) => (
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

  it('calls onNew when "New chat" is clicked', () => {
    const onNew = vi.fn()
    render(
      <Sidebar
        chatId={undefined}
        conversations={[]}
        onDelete={vi.fn()}
        onLoad={vi.fn()}
        onNew={onNew}
      />,
    )
    fireEvent.click(screen.getByText('New chat'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('calls onLoad when a conversation is clicked or activated via keyboard', () => {
    const onLoad = vi.fn()
    render(
      <Sidebar
        chatId={undefined}
        conversations={conversations}
        onDelete={vi.fn()}
        onLoad={onLoad}
        onNew={vi.fn()}
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
        onNew={vi.fn()}
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
        onNew={vi.fn()}
      />,
    )
    const deleteButtons = screen.getAllByRole('button', { name: /delete conversation/i })
    fireEvent.click(deleteButtons[0])
    expect(onDelete).not.toHaveBeenCalled()
  })
})
