import type { AdminViewServerProps } from 'payload'

import { CONVERSATIONS_SLUG } from '../conversations.js'
import ChatView from './ChatView.js'

export default async function ChatViewServer({ initPageResult: { req } }: AdminViewServerProps) {
  const conversationId = req.searchParams.get('conversation') ?? undefined
  const { payload, user } = req

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
