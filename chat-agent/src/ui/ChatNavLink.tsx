'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation.js'

export interface ChatNavLinkProps {
  /**
   * The admin route path for the chat view, e.g. `/chat` or `/assistant`.
   * Passed in via `clientProps` from the plugin so it stays in sync with
   * `adminView.path`.
   */
  path?: string
}

/**
 * Renders a link to the chat view styled like Payload's built-in nav links
 * (matches the `nav__link` / `nav__link-label` structure rendered by
 * `DefaultNavClient`, including the active-state indicator). Mounted via
 * `admin.components.beforeNavLinks`.
 */
export function ChatNavLink({ path = '/chat' }: ChatNavLinkProps) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const pathname = usePathname()

  const href = `${adminRoute}${path}`
  const isActive = pathname
    ? pathname === href || (pathname.startsWith(href) && pathname[href.length] === '/')
    : false

  const label = (
    <>
      {isActive && <div className="nav__link-indicator" />}
      <span className="nav__link-label">Chat Agent</span>
    </>
  )

  if (isActive) {
    return (
      <div aria-label="Open chat assistant" className="nav__link" id="nav-chat-agent">
        {label}
      </div>
    )
  }

  return (
    <Link
      aria-label="Open chat assistant"
      className="nav__link"
      href={href}
      id="nav-chat-agent"
      prefetch={false}
    >
      {label}
    </Link>
  )
}

export default ChatNavLink
