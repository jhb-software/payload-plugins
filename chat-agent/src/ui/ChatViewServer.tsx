import type { AdminViewServerProps } from 'payload'

import { isPluginAccessAllowed } from '../access.js'
import { CONVERSATIONS_SLUG } from '../conversations.js'
import ChatView from './ChatView.js'

export default async function ChatViewServer({ initPageResult: { req } }: AdminViewServerProps) {
  const conversationId = req.searchParams.get('conversation') ?? undefined
  const { payload, user } = req

  if (!(await isPluginAccessAllowed(req))) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>Not authorized</h2>
        <p>You do not have access to the chat agent.</p>
      </div>
    )
  }

  // Fetch the conversation list server-side so the sidebar renders immediately
  const { docs: conversations } = user
    ? await payload.find({
        collection: CONVERSATIONS_SLUG,
        depth: 0,
        limit: 50,
        sort: '-updatedAt',
        where: { user: { equals: user.id } },
      })
    : { docs: [] }

  // If a conversation ID is in the URL, fetch its messages + model server-side
  let initialMessages: undefined | unknown[]
  let initialModel: string | undefined
  if (conversationId && user) {
    try {
      const doc = await payload.findByID({
        id: conversationId,
        collection: CONVERSATIONS_SLUG,
        overrideAccess: false,
        user,
      })
      initialMessages = (doc.messages as unknown[]) ?? []
      initialModel = typeof doc.model === 'string' ? doc.model : undefined
    } catch {
      // Conversation not found — will start fresh
    }
  }

  return (
    <ChatView
      conversationId={conversationId}
      initialConversations={conversations.map((d) => ({
        id: String(d.id),
        title: (d.title as string) ?? 'New conversation',
        updatedAt: (d.updatedAt as string) ?? '',
      }))}
      initialMessages={initialMessages}
      initialModel={initialModel}
    />
  )
}
