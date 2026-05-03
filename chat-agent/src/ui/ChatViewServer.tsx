import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation.js'
import { formatAdminURL } from 'payload/shared'

import type { AgentMode } from '../types.js'

import { isPluginAccessAllowed } from '../access.js'
import { CONVERSATIONS_SLUG } from '../conversations.js'
import { pickEmptyState } from '../index.js'
import { getDefaultMode, resolveAvailableModes } from '../modes.js'
import { getPluginCustomConfig, getPluginOptions } from '../plugin-custom-config.js'
import { AGENT_MODES } from '../types.js'
import ChatView from './ChatView.js'

export default async function ChatViewServer({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const conversationId = req.searchParams.get('conversation') ?? undefined
  const { i18n, payload, user } = req

  // Custom admin views are not auto-gated by Payload's root router (see the
  // `isCustomAdminView` skip in `@payloadcms/next`'s RootPage), so an
  // unauthenticated visitor would otherwise see the nav chrome wrapped
  // around a "Not authorized" message.
  // Redirect to login ourselves and preserve the original path so
  // the user lands back on the chat view after signing in.
  if (!user) {
    const adminRoute = payload.config.routes.admin
    const loginRoute = payload.config.admin.routes.login
    const segments = Array.isArray(params?.segments) ? params.segments : []
    const currentPath: '' | `/${string}` | null = segments.length ? `/${segments.join('/')}` : null
    const queryString = req.searchParams.toString()
    const currentRoute =
      formatAdminURL({ adminRoute, path: currentPath }) + (queryString ? `?${queryString}` : '')
    const loginURL = formatAdminURL({ adminRoute, path: loginRoute })

    redirect(currentRoute ? `${loginURL}?redirect=${encodeURIComponent(currentRoute)}` : loginURL)
  }

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
  const modesConfig = getPluginCustomConfig(payload)?.modesConfig ?? {}
  const availableModes = await resolveAvailableModes(modesConfig, req)
  const defaultMode = getDefaultMode(modesConfig)
  const pluginOptions = getPluginOptions(payload)
  const availableModels = pluginOptions?.availableModels ?? []
  const defaultModel = pluginOptions?.defaultModel
  const emptyState = pickEmptyState(pluginOptions?.emptyState)

  // Fetch the conversation list server-side so the sidebar renders immediately.
  // The sidebar only uses `id`, `title`, and `updatedAt`; selecting just
  // those avoids sending the full `messages` JSON of every conversation on
  // the first paint.
  const { docs: conversations } = user
    ? await payload.find({
        collection: CONVERSATIONS_SLUG,
        depth: 0,
        limit: 50,
        select: { title: true, updatedAt: true },
        sort: '-updatedAt',
        where: { user: { equals: user.id } },
      })
    : { docs: [] }

  // If a conversation ID is in the URL, fetch its messages + model + mode server-side
  let initialMessages: undefined | unknown[]
  let initialMode: AgentMode | undefined
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
      initialMode =
        typeof doc.mode === 'string' && (AGENT_MODES as readonly string[]).includes(doc.mode)
          ? (doc.mode as AgentMode)
          : undefined
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
        emptyState={emptyState}
        initialConversations={conversations.map((d) => ({
          id: String(d.id),
          title: (d.title as string) ?? 'New conversation',
          updatedAt: (d.updatedAt as string) ?? '',
        }))}
        initialMessages={initialMessages}
        initialMode={initialMode}
        initialModel={initialModel}
      />
    </DefaultTemplate>
  )
}
