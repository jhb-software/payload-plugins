// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToolConfirmation } from './ToolConfirmation.js'

describe('ToolConfirmation', () => {
  afterEach(cleanup)

  it('renders the tool name and input JSON', () => {
    render(
      <ToolConfirmation
        input={{ collection: 'posts', data: { title: 'Hello' } }}
        onAllow={() => {}}
        onDeny={() => {}}
        status="pending"
        toolName="create"
      />,
    )
    expect(screen.getByText('create')).toBeDefined()
    expect(screen.getByText(/"collection": "posts"/)).toBeDefined()
    expect(screen.getByText(/"title": "Hello"/)).toBeDefined()
  })

  it('calls onAllow when the Allow button is clicked', () => {
    const onAllow = vi.fn()
    render(
      <ToolConfirmation
        input={{}}
        onAllow={onAllow}
        onDeny={() => {}}
        status="pending"
        toolName="create"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onAllow).toHaveBeenCalledTimes(1)
  })

  it('calls onDeny when the Deny button is clicked', () => {
    const onDeny = vi.fn()
    render(
      <ToolConfirmation
        input={{}}
        onAllow={() => {}}
        onDeny={onDeny}
        status="pending"
        toolName="create"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(onDeny).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons and shows "Executing…" when status is executing', () => {
    render(
      <ToolConfirmation
        input={{}}
        onAllow={() => {}}
        onDeny={() => {}}
        status="executing"
        toolName="update"
      />,
    )
    const allow = screen.getByRole<HTMLButtonElement>('button', { name: /executing/i })
    const deny = screen.getByRole<HTMLButtonElement>('button', { name: /deny/i })
    expect(allow.disabled).toBe(true)
    expect(deny.disabled).toBe(true)
  })
})
