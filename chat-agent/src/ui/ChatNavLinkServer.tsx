import type { ServerProps } from 'payload'

import { isPluginAccessAllowed } from '../access.js'
import ChatNavLink from './ChatNavLink.js'

interface ChatNavLinkServerProps extends ServerProps {
  /** Admin route path for the chat view (forwarded to the client component). */
  path?: string
}

/**
 * Server wrapper for the ChatNavLink component. Checks the plugin's `access`
 * function (stored in `payload.config.custom.chatAgent.pluginOptions.access`)
 * before rendering. If the user is not allowed, returns `null` so the link
 * is hidden from the admin nav sidebar.
 */
export default async function ChatNavLinkServer({ path, payload, user }: ChatNavLinkServerProps) {
  if (!(await isPluginAccessAllowed({ payload, user: user ?? null }))) {
    return null
  }

  return <ChatNavLink path={path} />
}
