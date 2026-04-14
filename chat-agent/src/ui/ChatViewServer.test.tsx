// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ChatView.js', () => ({
  default: () => <div data-testid="chat-view" />,
}))

const { default: ChatViewServer } = await import('./ChatViewServer.js')

function makeReq(access?: (req: any) => boolean | Promise<boolean>) {
  const payload: any = {
    config: { custom: { chatAgent: access ? { access } : {} } },
    find: async () => ({ docs: [] }),
    findByID: async () => ({ messages: [] }),
  }
  const req: any = {
    payload,
    searchParams: new URLSearchParams(),
    user: { id: 'u1' },
  }
  payload.req = req
  return req
}

describe('ChatViewServer', () => {
  afterEach(cleanup)

  it('renders the chat view when access is allowed', async () => {
    const jsx = await ChatViewServer({
      initPageResult: { req: makeReq(() => true) },
    } as any)

    render(jsx as any)
    expect(screen.getByTestId('chat-view')).toBeTruthy()
  })

  it('renders a not-authorized message when plugin access() denies', async () => {
    const jsx = await ChatViewServer({
      initPageResult: { req: makeReq(() => false) },
    } as any)

    render(jsx as any)
    expect(screen.getByText(/not authorized/i)).toBeTruthy()
    expect(screen.queryByTestId('chat-view')).toBeNull()
  })
})
