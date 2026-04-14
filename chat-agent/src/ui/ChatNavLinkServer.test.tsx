// @vitest-environment jsdom
import type { ServerProps } from 'payload'
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Props accepted by ChatNavLinkServer. Mirrors `ChatNavLinkServerProps`. */
type NavLinkServerProps = { path?: string } & ServerProps

/**
 * Tests only supply `payload` and `user`; the real `ServerProps` requires
 * 20+ fields (i18n, permissions, clientConfig, …). This helper routes the
 * minimal mock through an explicit cast so the partial shape is obvious.
 */
const asServerProps = (v: {
  path?: string
  payload: { config: unknown }
  user?: unknown
}): NavLinkServerProps => v as unknown as NavLinkServerProps

/** Minimal Payload `Link` prop shape we rely on in tests. */
type LinkMockProps = { children?: ReactNode; href: string; prefetch?: boolean } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'href'
>

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, href, prefetch: _prefetch, ...rest }: LinkMockProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useConfig: () => ({
    config: { routes: { admin: '/admin' } },
  }),
}))

vi.mock('next/navigation.js', () => ({
  usePathname: () => '/admin',
}))

const { default: ChatNavLinkServer } = await import('./ChatNavLinkServer.js')

/**
 * Test-only helper for rendering a server component.
 *
 * Server components return a `Promise<ReactElement>`; the production type of
 * `ChatNavLinkServer`'s props (`ServerProps`) is the real Payload type, but
 * its 20+ required fields (i18n, permissions, clientConfig, …) are not
 * exercised by these tests. Callers build a minimal props object and cast
 * via `unknown` at the call site.
 */
function renderServerComponent(jsx: null | ReactElement) {
  if (!jsx) {
    throw new Error('Server component returned null; expected a rendered element')
  }
  return render(jsx)
}

describe('ChatNavLinkServer', () => {
  afterEach(cleanup)

  it('renders the nav link for an authenticated user with no custom access', async () => {
    const jsx = await ChatNavLinkServer(
      asServerProps({
        payload: { config: { custom: { chatAgent: {} } } },
        user: { id: 'u1' },
      }),
    )

    renderServerComponent(jsx)
    expect(screen.getByRole('link', { name: /open chat assistant/i })).toBeTruthy()
  })

  it('hides the nav link when user is null', async () => {
    const jsx = await ChatNavLinkServer(
      asServerProps({
        payload: { config: { custom: { chatAgent: {} } } },
        user: undefined,
      }),
    )

    expect(jsx).toBeNull()
  })

  it('hides the nav link when custom access returns false', async () => {
    const jsx = await ChatNavLinkServer(
      asServerProps({
        payload: {
          config: {
            custom: { chatAgent: { access: () => false } },
          },
        },
        user: { id: 'u1' },
      }),
    )

    expect(jsx).toBeNull()
  })

  it('shows the nav link when custom access returns true', async () => {
    const jsx = await ChatNavLinkServer(
      asServerProps({
        payload: {
          config: {
            custom: { chatAgent: { access: () => true } },
          },
        },
        user: { id: 'u1' },
      }),
    )

    renderServerComponent(jsx)
    expect(screen.getByRole('link', { name: /open chat assistant/i })).toBeTruthy()
  })

  it('forwards the path prop to ChatNavLink', async () => {
    const jsx = await ChatNavLinkServer(
      asServerProps({
        path: '/assistant',
        payload: {
          config: { custom: { chatAgent: {} } },
        },
        user: { id: 'u1' },
      }),
    )

    renderServerComponent(jsx)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/assistant')
  })
})
