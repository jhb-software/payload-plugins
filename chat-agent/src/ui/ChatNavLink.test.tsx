// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let mockPathname = '/admin'

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, href, prefetch: _prefetch, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useConfig: () => ({
    config: { routes: { admin: '/admin' } },
  }),
}))

vi.mock('next/navigation.js', () => ({
  usePathname: () => mockPathname,
}))

const { ChatNavLink } = await import('./ChatNavLink.js')

describe('ChatNavLink', () => {
  afterEach(() => {
    cleanup()
    mockPathname = '/admin'
  })

  it('renders a link to /admin/chat by default with the "Chat Agent" label', () => {
    render(<ChatNavLink />)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/chat')
    expect(link.textContent).toContain('Chat Agent')
  })

  it('respects a custom path prop', () => {
    render(<ChatNavLink path="/assistant" />)
    const link = screen.getByRole('link', { name: /open chat assistant/i })
    expect(link.getAttribute('href')).toBe('/admin/assistant')
  })

  it('renders without a <Link> when the current path matches (active state)', () => {
    mockPathname = '/admin/chat'
    render(<ChatNavLink />)
    // No role=link because active state drops the anchor (matches Payload's DefaultNavClient behavior)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Chat Agent')).toBeTruthy()
  })
})
