// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModeSelector } from './ModeSelector.js'

describe('ModeSelector', () => {
  afterEach(cleanup)

  it('returns null when there is only one available mode', () => {
    const { container } = render(
      <ModeSelector availableModes={['ask']} mode="ask" onModeChange={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a select with the available modes when there are 2+', () => {
    render(
      <ModeSelector
        availableModes={['read', 'ask', 'read-write']}
        mode="ask"
        onModeChange={() => {}}
      />,
    )
    const select = screen.getByRole<HTMLSelectElement>('combobox')
    expect(select.value).toBe('ask')
    expect(select.options).toHaveLength(3)
  })

  it('calls onModeChange with the new value when selection changes', () => {
    const onModeChange = vi.fn()
    render(
      <ModeSelector
        availableModes={['read', 'ask', 'read-write']}
        mode="ask"
        onModeChange={onModeChange}
      />,
    )
    const select = screen.getByRole<HTMLSelectElement>('combobox')
    fireEvent.change(select, { target: { value: 'read-write' } })
    expect(onModeChange).toHaveBeenCalledWith('read-write')
  })

  it('disables the select when disabled prop is true', () => {
    render(
      <ModeSelector availableModes={['read', 'ask']} disabled mode="ask" onModeChange={() => {}} />,
    )
    const select = screen.getByRole<HTMLSelectElement>('combobox')
    expect(select.disabled).toBe(true)
  })
})
