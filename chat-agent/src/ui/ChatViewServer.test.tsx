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

// `redirect()` in next/navigation throws a special NEXT_REDIRECT error that
// halts rendering. Replace with a throw that captures the target so we can
// assert the unauthenticated path actually redirects (as opposed to silently
// rendering the nav chrome around a "Not authorized" message).
class MockRedirectError extends Error {
  constructor(public target: string) {
    super(`NEXT_REDIRECT:${target}`)
  }
}
vi.mock('next/navigation.js', () => ({
  redirect: (target: string) => {
    throw new MockRedirectError(target)
  },
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

function makeReq(
  access?: (req: PayloadRequest) => boolean | Promise<boolean>,
  {
    searchParams = new URLSearchParams(),
    user = { id: 'u1' } as { id: string } | null,
  }: { searchParams?: URLSearchParams; user?: { id: string } | null } = {},
): PayloadRequest {
  const payload = {
    config: {
      admin: { routes: { login: '/login' } },
      custom: { chatAgent: access ? { pluginOptions: { access } } : {} },
      routes: { admin: '/admin' },
    },
    find: () => Promise.resolve({ docs: [] }),
    findByID: () => Promise.resolve({ messages: [] }),
  }
  const req = {
    payload,
    searchParams,
    user,
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

  it('redirects unauthenticated visitors to the admin login instead of rendering the page', async () => {
    // Custom admin views in Payload are NOT auto-gated by the root router.
    // Without an explicit redirect here, anyone could hit /admin/chat while
    // logged out and see the admin chrome + nav sidebar around a
    // "Not authorized" message. Lock in that the view redirects to the
    // login route instead, preserving the requested path so the user lands
    // back on /admin/chat after signing in.
    await expect(
      ChatViewServer(
        asAdminViewProps({
          initPageResult: { req: makeReq(undefined, { user: null }) },
          params: { segments: ['chat'] },
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT:\/admin\/login\?redirect=%2Fadmin%2Fchat/)
  })

  it('fetches only the fields the sidebar renders (title + updatedAt) for the SSR conversation list', async () => {
    // The SSR path seeds the sidebar via payload.find(). Without a `select`,
    // Payload returns the full `messages` JSON on every doc, multiplying the
    // first-paint payload by the conversation history. Lock in the narrow
    // select shape so it stays aligned with what the sidebar actually
    // renders (see `ChatViewServer.tsx` mapping to id/title/updatedAt).
    const captured: { select?: Record<string, boolean> } = {}
    const req = makeReq(() => true)
    ;(req.payload as { find: (args: unknown) => Promise<unknown> }).find = (args: unknown) => {
      Object.assign(captured, args as object)
      return Promise.resolve({ docs: [] })
    }
    await ChatViewServer(asAdminViewProps({ initPageResult: { req } }))
    expect(captured.select).toEqual({ title: true, updatedAt: true })
  })

  it('preserves query params on the redirect target so the post-login URL keeps e.g. ?conversation=…', async () => {
    // Deep-links (e.g. /admin/chat?conversation=abc) should survive a login
    // round-trip. The chat view opens a specific conversation based on the
    // `conversation` param, so dropping it would silently reset the user to
    // a blank chat after they sign in.
    await expect(
      ChatViewServer(
        asAdminViewProps({
          initPageResult: {
            req: makeReq(undefined, {
              searchParams: new URLSearchParams({ conversation: 'abc' }),
              user: null,
            }),
          },
          params: { segments: ['chat'] },
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT:\/admin\/login\?redirect=%2Fadmin%2Fchat%3Fconversation%3Dabc/)
  })
})
