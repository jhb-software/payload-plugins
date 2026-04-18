/**
 * Conversation persistence for the chat agent plugin.
 *
 * Defines the Payload collection and REST endpoint handlers for
 * storing and retrieving chat conversations.
 *
 * Types are kept inline to avoid a hard dependency on `payload`.
 */

import type { AccessArgs, CollectionConfig, Endpoint, PayloadRequest } from 'payload'

import { isPluginAccessAllowed } from './access.js'
import { AGENT_MODES, type AgentMode } from './types.js'

export const CONVERSATIONS_SLUG = 'agent-conversations'

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

export const conversationsCollection: CollectionConfig = {
  slug: CONVERSATIONS_SLUG,
  access: {
    create: ({ req }: AccessArgs) => !!req.user,
    delete: ({ req }: AccessArgs) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
    read: ({ req }: AccessArgs) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
    update: ({ req }: AccessArgs) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
  },
  admin: {
    group: 'Chat',
    // Conversations are user-private chat history consumed by the chat UI,
    // not by an admin editor. Hide from the admin nav by default.
    hidden: true,
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'New conversation',
      required: true,
    },
    {
      name: 'messages',
      type: 'json',
      defaultValue: [],
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      admin: { readOnly: true },
      // Every read goes through `access.read`, which filters by
      // `user.equals = currentUser.id`, and the sidebar list query filters
      // by the same field. Without an index, both degrade to a full scan
      // once the collection grows beyond a trivial size.
      index: true,
      relationTo: 'users',
      required: true,
    },
    {
      name: 'model',
      type: 'text',
    },
    {
      name: 'mode',
      type: 'select',
      options: AGENT_MODES.map((m) => ({ label: m, value: m })),
    },
    {
      name: 'totalTokens',
      type: 'number',
      defaultValue: 0,
    },
  ],
  hooks: {
    // Force the `user` field to the authenticated user, regardless of what the
    // client sent. Without this, a user hitting Payload's default REST
    // (`POST /api/agent-conversations`) could create a record with
    // `data.user` set to someone else's id — they still can't read/update/
    // delete it thanks to the access filters, but they'd pollute the
    // collection. The `update` guard also protects against a client trying to
    // re-assign ownership to escalate visibility.
    beforeValidate: [
      ({ data, operation, req }) => {
        if (!req.user) {
          return data
        }
        if (operation === 'create' || operation === 'update') {
          return { ...data, user: req.user.id }
        }
        return data
      },
    ],
  },
  timestamps: true,
}

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

/** GET /api/chat-agent/chat/conversations — list user's conversations */
async function listConversations(req: PayloadRequest): Promise<Response> {
  if (!(await isPluginAccessAllowed(req)) || !req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await req.payload.find({
    collection: CONVERSATIONS_SLUG,
    depth: 0,
    limit: 50,
    // The sidebar only renders `id`, `title`, and `updatedAt` — the full
    // `messages` JSON on every doc would bloat the payload by the entire
    // conversation history of every conversation for no reason.
    select: { title: true, updatedAt: true },
    sort: '-updatedAt',
    where: { user: { equals: req.user.id } },
  })

  return Response.json(result)
}

/** GET /api/chat-agent/chat/conversations/:id — get single conversation */
async function getConversation(req: PayloadRequest): Promise<Response> {
  if (!(await isPluginAccessAllowed(req)) || !req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  try {
    const doc = await req.payload.findByID({
      id,
      collection: CONVERSATIONS_SLUG,
      overrideAccess: false,
      user: req.user,
    })
    return Response.json(doc)
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
}

interface ConversationBody {
  messages?: unknown[]
  mode?: AgentMode
  model?: string
  title?: string
}

/**
 * Derive `totalTokens` server-side by summing `metadata.totalTokens` across
 * the provided messages array. The metadata is attached to the SSE stream by
 * the chat endpoint (see `toUIMessageStreamResponse` in `index.ts`), so
 * trusting the messages round-tripped from the client is equivalent to
 * trusting the messages themselves — but computing the aggregate server-side
 * prevents a client from sending a mismatched total (e.g. `totalTokens: 0`
 * with a long conversation attached) to skew usage metrics.
 */
function sumMessageTokens(messages: undefined | unknown[]): number {
  if (!Array.isArray(messages)) {
    return 0
  }
  let total = 0
  for (const msg of messages) {
    const meta = (msg as { metadata?: { totalTokens?: unknown } } | null)?.metadata
    if (typeof meta?.totalTokens === 'number') {
      total += meta.totalTokens
    }
  }
  return total
}

/** POST /api/chat-agent/chat/conversations — create a conversation */
async function createConversation(req: PayloadRequest): Promise<Response> {
  if (!(await isPluginAccessAllowed(req)) || !req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ConversationBody
  try {
    body = (await req.json?.()) as ConversationBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const doc = await req.payload.create({
    collection: CONVERSATIONS_SLUG,
    data: {
      messages: body.messages ?? [],
      mode: body.mode,
      model: body.model,
      title: body.title ?? 'New conversation',
      totalTokens: sumMessageTokens(body.messages),
      user: req.user.id,
    },
  })

  return Response.json(doc, { status: 201 })
}

/** PATCH /api/chat-agent/chat/conversations/:id — update a conversation */
async function updateConversation(req: PayloadRequest): Promise<Response> {
  if (!(await isPluginAccessAllowed(req)) || !req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  let body: ConversationBody
  try {
    body = (await req.json?.()) as ConversationBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only allow updating specific fields. `totalTokens` is intentionally not
  // in the allowlist: whenever messages are updated we re-derive it server-
  // side from `metadata.totalTokens` on each message, so the client cannot
  // skew the aggregate independently from the message list.
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    data.title = body.title
  }
  if (body.messages !== undefined) {
    data.messages = body.messages
    data.totalTokens = sumMessageTokens(body.messages)
  }
  if (body.model !== undefined) {
    data.model = body.model
  }
  if (body.mode !== undefined) {
    data.mode = body.mode
  }

  try {
    const doc = await req.payload.update({
      id,
      collection: CONVERSATIONS_SLUG,
      data,
      overrideAccess: false,
      user: req.user,
    })
    return Response.json(doc)
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
}

/** DELETE /api/chat-agent/chat/conversations/:id — delete a conversation */
async function deleteConversation(req: PayloadRequest): Promise<Response> {
  if (!(await isPluginAccessAllowed(req)) || !req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  try {
    await req.payload.delete({
      id,
      collection: CONVERSATIONS_SLUG,
      overrideAccess: false,
      user: req.user,
    })
    return Response.json({ deleted: true })
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
}

// ---------------------------------------------------------------------------
// Endpoint definitions for the plugin
// ---------------------------------------------------------------------------

export const conversationEndpoints: Endpoint[] = [
  {
    handler: listConversations,
    method: 'get',
    path: '/chat-agent/chat/conversations',
  },
  {
    handler: getConversation,
    method: 'get',
    path: '/chat-agent/chat/conversations/:id',
  },
  {
    handler: createConversation,
    method: 'post',
    path: '/chat-agent/chat/conversations',
  },
  {
    handler: updateConversation,
    method: 'patch',
    path: '/chat-agent/chat/conversations/:id',
  },
  {
    handler: deleteConversation,
    method: 'delete',
    path: '/chat-agent/chat/conversations/:id',
  },
]
