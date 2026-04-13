// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useConfig: () => ({
    config: { routes: { admin: '/admin' } },
  }),
}))

const { default: ChatNavLinkServer } = await import('./ChatNavLinkServer.js')

function renderServerComponent(jsx: any) {
  // Server components are async functions returning JSX. We await them,
  // then render the result with @testing-library/react.
  return render(jsx)
}

describe('ChatNavLinkServer', () => {
  afterEach(cleanup)

  it('renders the nav link for an authenticated user with no custom access', async () => {
    const jsx = await ChatNavLinkServer({
      payload: { config: { custom: { chatAgent: {} } } },
      user: { id: 'u1' },
    } as any)

    renderServerComponent(jsx)
    expect(screen.getByRole('link', { name: /open chat assistant/i })).toBeTruthy()
  })

  it('hides the nav link when user is null', async () => {
    const jsx = await ChatNavLinkServer({
      payload: { config: { custom: { chatAgent: {} } } },
      user: undefined,
    } as any)

    expect(jsx).toBeNull()
  })

  it('hides the nav link when custom access returns false', async () => {
    const jsx = await ChatNavLinkServer({
      payload: {
        config: {
          custom: { chatAgent: { access: () => false } },
        },
      },
      user: { id: 'u1' },
    } as any)

    expect(jsx).toBeNull()
  })

  it('shows the nav link when custom access returns true', async () => {
    const jsx = await ChatNavLinkServer({
      payload: {
        config: {
          custom: { chatAgent: { access: () => true } },
        },
      },
      user: { id: 'u1' },
    } as any)

    renderServerComponent(jsx)
    expect(screen.getByRole('link', { name: /open chat assistant/i })).toBeTruthy()
  })

  it('forwards the path prop to ChatNavLink', async () => {
    const jsx = await ChatNavLinkServer({
      path: '/assistant',
      payload: {
        config: { custom: { chatAgent: {} } },
      },
      user: { id: 'u1' },
    } as any)

    renderServerComponent(jsx)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/assistant')
  })
})
