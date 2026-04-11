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

const { ChatNavLink } = await import('./ChatNavLink.js')

describe('ChatNavLink', () => {
  afterEach(cleanup)

  it('renders a link to /admin/chat by default', () => {
    render(<ChatNavLink />)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/chat')
    expect(link.textContent).toContain('Chat')
  })

  it('respects a custom path prop', () => {
    render(<ChatNavLink path="/assistant" />)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/assistant')
  })
})
