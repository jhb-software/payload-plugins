import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'

import type { ModelOption, ModesConfig } from '../types.js'

import { isPluginAccessAllowed } from '../access.js'
import { CONVERSATIONS_SLUG } from '../conversations.js'
import { getDefaultMode, resolveAvailableModes } from '../modes.js'
import ChatView from './ChatView.js'

export default async function ChatViewServer({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const conversationId = req.searchParams.get('conversation') ?? undefined
  const { i18n, payload, user } = req

  // Payload's route resolver does NOT auto-wrap custom admin views registered
  // via `admin.components.views` in DefaultTemplate — custom views get no
  // template at all. Wrap the chat view ourselves so it keeps the standard
  // admin chrome (nav sidebar + header).
  const templateProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user: user ?? undefined,
    visibleEntities,
  }

  if (!(await isPluginAccessAllowed(req))) {
    return (
      <DefaultTemplate {...templateProps}>
        <div style={{ padding: '2rem' }}>
          <h2>Not authorized</h2>
          <p>You do not have access to the chat agent.</p>
        </div>
      </DefaultTemplate>
    )
  }

  // Resolve modes + models config server-side so the selectors render with the
  // first paint instead of flashing in after a client-side fetch on mount.
  const pluginConfig = (payload.config.custom?.chatAgent ?? {}) as {
    availableModels?: ModelOption[]
    defaultModel?: string
    modesConfig?: ModesConfig
    suggestedPrompts?: string[]
  }
  const modesConfig = pluginConfig.modesConfig ?? {}
  const availableModes = await resolveAvailableModes(modesConfig, req)
  const defaultMode = getDefaultMode(modesConfig)
  const availableModels = pluginConfig.availableModels ?? []
  const defaultModel = pluginConfig.defaultModel
  const suggestedPrompts = pluginConfig.suggestedPrompts

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
    <DefaultTemplate {...templateProps}>
      <ChatView
        availableModels={availableModels}
        availableModes={availableModes}
        conversationId={conversationId}
        defaultMode={defaultMode}
        defaultModel={defaultModel}
        initialConversations={conversations.map((d) => ({
          id: String(d.id),
          title: (d.title as string) ?? 'New conversation',
          updatedAt: (d.updatedAt as string) ?? '',
        }))}
        initialMessages={initialMessages}
        initialModel={initialModel}
        suggestedPrompts={suggestedPrompts}
      />
    </DefaultTemplate>
  )
}
