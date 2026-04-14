// @vitest-environment jsdom
import type { AdminViewServerProps, PayloadRequest } from 'payload'
import type { ReactElement, ReactNode } from 'react'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ChatView.js', () => ({
  default: () => <div data-testid="chat-view" />,
}))

// DefaultTemplate pulls in a lot of Payload runtime wiring (nav/sidebar,
// importMap, etc.). Replace it with a pass-through so these tests stay
// focused on ChatViewServer's own logic — the fact that we wrap in
// DefaultTemplate is verified separately by checking the import/element.
vi.mock('@payloadcms/next/templates', () => ({
  DefaultTemplate: ({ children }: { children: ReactNode }) => (
    <div data-testid="default-template">{children}</div>
  ),
}))

const { default: ChatViewServer } = await import('./ChatViewServer.js')

/**
 * `PayloadRequest`, `AdminViewServerProps`, and the `LanguageModel`-shaped
 * sentinels in this file require dozens of fields the tests never touch.
 * The helpers below route minimal mocks through an explicit cast, so the
 * partial shape is deliberately opt-in rather than silently `any`.
 */
const asReq = (v: unknown) => v as PayloadRequest
const asAdminViewProps = (v: unknown) => v as AdminViewServerProps

function makeReq(access?: (req: PayloadRequest) => boolean | Promise<boolean>): PayloadRequest {
  const payload = {
    config: { custom: { chatAgent: access ? { access } : {} } },
    find: async () => ({ docs: [] }),
    findByID: async () => ({ messages: [] }),
  }
  const req = {
    payload,
    searchParams: new URLSearchParams(),
    user: { id: 'u1' },
  }
  ;(payload as { req?: unknown }).req = req
  return asReq(req)
}

describe('ChatViewServer', () => {
  afterEach(cleanup)

  it('renders the chat view when access is allowed', async () => {
    const jsx = (await ChatViewServer(
      asAdminViewProps({ initPageResult: { req: makeReq(() => true) } }),
    )) as ReactElement

    render(jsx)
    expect(screen.getByTestId('chat-view')).toBeTruthy()
  })

  it('wraps the chat view in DefaultTemplate so the admin nav/sidebar is preserved', async () => {
    // Custom admin views in Payload are NOT auto-wrapped in DefaultTemplate;
    // without this wrapping the chat view would render without the nav bar
    // and sidebar. Lock in that the template wrapper is always present.
    const jsx = (await ChatViewServer(
      asAdminViewProps({ initPageResult: { req: makeReq(() => true) } }),
    )) as ReactElement

    render(jsx)
    const template = screen.getByTestId('default-template')
    expect(template).toBeTruthy()
    expect(template.contains(screen.getByTestId('chat-view'))).toBe(true)
  })

  it('renders a not-authorized message when plugin access() denies', async () => {
    const jsx = (await ChatViewServer(
      asAdminViewProps({ initPageResult: { req: makeReq(() => false) } }),
    )) as ReactElement

    render(jsx)
    expect(screen.getByText(/not authorized/i)).toBeTruthy()
    expect(screen.queryByTestId('chat-view')).toBeNull()
  })

  it('wraps the not-authorized fallback in DefaultTemplate too', async () => {
    // We still want denied users to see the normal admin chrome around the
    // message — otherwise the view feels like a crash page.
    const jsx = (await ChatViewServer(
      asAdminViewProps({ initPageResult: { req: makeReq(() => false) } }),
    )) as ReactElement

    render(jsx)
    const template = screen.getByTestId('default-template')
    expect(template).toBeTruthy()
    expect(template.textContent).toMatch(/not authorized/i)
  })
})
