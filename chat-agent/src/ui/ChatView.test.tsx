// @vitest-environment jsdom
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks for the Payload UI surface used by ChatView and its children.
// These are structural shims — we don't care how Payload renders a pill or
// a select, only that our own UI wiring (error banner, new-chat button) works.
// ---------------------------------------------------------------------------

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    type = 'button',
    buttonStyle: _buttonStyle,
    children,
    disabled,
    margin: _margin,
    onClick,
    round: _round,
    size: _size,
    tooltip,
    ...rest
  }: {
    buttonStyle?: string
    children?: ReactNode
    disabled?: boolean
    margin?: boolean
    onClick?: MouseEventHandler<HTMLButtonElement>
    round?: boolean
    size?: string
    tooltip?: string
    type?: 'button' | 'submit'
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...rest}
      aria-label={rest['aria-label'] ?? tooltip}
      disabled={disabled}
      onClick={onClick}
      title={rest.title ?? tooltip}
      type={type}
    >
      {children}
    </button>
  ),
  FieldLabel: ({ label }: { label?: ReactNode }) => <span>{label}</span>,
  ReactSelect: () => <div data-testid="react-select" />,
  SetStepNav: () => null,
  ShimmerEffect: (props: { height?: number | string; width?: number | string }) => (
    <div data-testid="shimmer" style={{ height: props.height, width: props.width }} />
  ),
}))

// MarkdownContent transitively imports `react-markdown` + `remark-gfm`, which
// pull in ESM-only deps that are slow to transform. Replace with a plain text
// renderer — our test only needs to see the error banner and the input.
vi.mock('./MarkdownContent.js', () => ({
  MarkdownContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

const { default: ChatView } = await import('./ChatView.js')

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn()
  // jsdom doesn't implement matchMedia; ChatInput uses it to decide whether
  // to auto-focus the textarea. Stub with a "coarse pointer" so focus is
  // skipped — our test interacts via fireEvent, not via the textarea ref.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }))
})

// ---------------------------------------------------------------------------
// Fetch stubbing
// ---------------------------------------------------------------------------

interface FetchStubOptions {
  chatResponse: () => Promise<Response> | Response
  conversationDoc?: (id: string) => Record<string, unknown>
  conversationList?: Record<string, unknown>[]
}

function installFetchStub({
  chatResponse,
  conversationDoc,
  conversationList = [],
}: FetchStubOptions): ReturnType<typeof vi.fn> {
  const asUrl = (input: RequestInfo | URL): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = asUrl(input)
    if (url === '/api/chat-agent/chat') {
      return await chatResponse()
    }
    if (url.includes('/api/chat-agent/chat/conversations')) {
      if (init?.method === 'POST' || init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'new-id' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      // GET: list or single doc.
      const convIdMatch = url.match(/\/conversations\/([^/?]+)/)
      if (convIdMatch && conversationDoc) {
        return new Response(JSON.stringify(conversationDoc(convIdMatch[1])), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ docs: conversationList }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatView error banner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  // Reproduces the reported UX bug: after a stream error the banner appears
  // above the input. If the user clicks "New chat" (or switches to a different
  // conversation via the sidebar), the new chat inherits the error banner of
  // the previous one — even though the error had nothing to do with it.
  it('clears the error banner when starting a new chat', async () => {
    installFetchStub({
      chatResponse: () =>
        new Response(JSON.stringify({ error: 'boom' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        }),
    })

    render(<ChatView />)

    const textarea = screen.getByLabelText('Chat message')
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hi' } })
    })
    const sendButton = screen.getByRole('button', { name: /send message/i })
    act(() => {
      fireEvent.click(sendButton)
    })
    // Give the AI SDK a tick to resolve the failing fetch and flush error state.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // The banner is inlined into the DOM with a distinctive error background
    // color — use that to locate it without depending on the exact error
    // message (which comes from the server / the SDK and would be brittle).
    const findBanner = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLDivElement>('div[style]'))
      return candidates.find((el) => el.style.background.includes('--theme-error')) ?? null
    }

    const banner = await waitFor(() => {
      const el = findBanner()
      if (!el) {
        throw new Error('error banner did not appear')
      }
      return el
    })
    expect(banner).toBeTruthy()
    expect(banner.textContent?.length ?? 0).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /new chat/i }))

    // After switching to a new chat, the banner for the previous chat's
    // error should no longer be rendered.
    await waitFor(() => {
      expect(findBanner()).toBeNull()
    })
  })

  // Same bug, different entry point: loading a different conversation from
  // the sidebar must also drop the prior chat's error banner — otherwise the
  // sidebar-switch path silently inherits the error into the wrong chat.
  it('clears the error banner when switching to another conversation from the sidebar', async () => {
    installFetchStub({
      chatResponse: () =>
        new Response(JSON.stringify({ error: 'boom' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        }),
      conversationDoc: (id) => ({
        id,
        messages: [],
        mode: 'ask',
        model: undefined,
        title: 'Other chat',
      }),
      conversationList: [
        { id: 'other-convo', title: 'Other chat', updatedAt: new Date().toISOString() },
      ],
    })

    render(
      <ChatView
        initialConversations={[
          { id: 'other-convo', title: 'Other chat', updatedAt: new Date().toISOString() },
        ]}
      />,
    )

    const textarea = screen.getByLabelText('Chat message')
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hi' } })
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /send message/i }))
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const findBanner = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLDivElement>('div[style]'))
      return candidates.find((el) => el.style.background.includes('--theme-error')) ?? null
    }

    await waitFor(() => {
      if (!findBanner()) {
        throw new Error('error banner did not appear')
      }
    })

    // Click the sidebar entry for the other conversation. The item renders
    // as a `role="button"` div containing the title.
    const sidebarItem = Array.from(
      document.querySelectorAll<HTMLDivElement>('[role="button"]'),
    ).find((el) => el.textContent?.includes('Other chat'))
    if (!sidebarItem) {
      throw new Error('sidebar entry not found')
    }
    await act(async () => {
      fireEvent.click(sidebarItem)
      await new Promise((r) => setTimeout(r, 50))
    })

    await waitFor(() => {
      expect(findBanner()).toBeNull()
    })
  })
})
