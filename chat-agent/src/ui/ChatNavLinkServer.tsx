import type { ServerProps } from 'payload'

import ChatNavLink from './ChatNavLink.js'

interface ChatNavLinkServerProps extends ServerProps {
  /** Admin route path for the chat view (forwarded to the client component). */
  path?: string
}

/**
 * Server wrapper for the ChatNavLink component. Checks the plugin's `access`
 * function (stored in `payload.config.custom.chatAgent.access`) before
 * rendering. If the user is not allowed, returns `null` so the link is hidden
 * from the admin nav sidebar.
 */
export default async function ChatNavLinkServer({ path, payload, user }: ChatNavLinkServerProps) {
  const chatAgent = (payload as any).config?.custom?.chatAgent
  const access = chatAgent?.access as ((req: any) => boolean | Promise<boolean>) | undefined

  const allowed = access ? await access({ payload, user }) : !!user
  if (!allowed) {
    return null
  }

  return <ChatNavLink path={path} />
}
