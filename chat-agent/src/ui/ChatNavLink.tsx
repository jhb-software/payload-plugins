'use client'

import { Link, useConfig } from '@payloadcms/ui'

export interface ChatNavLinkProps {
  /**
   * The admin route path for the chat view, e.g. `/chat` or `/assistant`.
   * Passed in via `clientProps` from the plugin so it stays in sync with
   * `adminView.path`.
   */
  path?: string
}

/**
 * Renders a link to the chat view at the top of the Payload admin nav
 * sidebar. Mounted via `admin.components.beforeNavLinks`.
 */
export function ChatNavLink({ path = '/chat' }: ChatNavLinkProps) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()

  const href = `${adminRoute}${path}`

  return (
    <Link
      aria-label="Open chat assistant"
      className="nav__link"
      href={href}
      style={{
        alignItems: 'center',
        color: 'var(--theme-elevation-800)',
        display: 'flex',
        gap: '10px',
        padding: '8px 0',
        textDecoration: 'none',
      }}
    >
      <MessageIcon />
      <span>Chat</span>
    </Link>
  )
}

export default ChatNavLink

// Geist "message" icon — https://github.com/jarvis394/geist-icons/blob/main/source/message.svg
function MessageIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="geist-icon"
      height="16"
      strokeLinejoin="round"
      style={{ color: 'currentcolor', flexShrink: 0 }}
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        clipRule="evenodd"
        d="M2.891 10.403l.092.229c.246.613.517 1.473.517 2.368 0 .359-.044.713-.112 1.05a7.162 7.162 0 002.322-1.297l.515-.43.663.097c.36.052.732.08 1.112.08 3.784 0 6.5-2.644 6.5-5.5S11.784 1.5 8 1.5 1.5 4.144 1.5 7c0 1.182.442 2.293 1.231 3.215l.16.188zm-.078 5.362C1.761 16 1 16 1 16s.433-.69.73-1.563C1.882 13.983 2 13.48 2 13c0-.617-.193-1.27-.409-1.81C.591 10.022 0 8.572 0 7c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7c-.453 0-.897-.033-1.33-.096A8.656 8.656 0 015 15a9.572 9.572 0 01-2.187.765z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
