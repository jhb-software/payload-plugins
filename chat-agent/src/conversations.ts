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

export const CONVERSATIONS_SLUG = 'chat-conversations'

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
      relationTo: 'users',
      required: true,
    },
    {
      name: 'model',
      type: 'text',
    },
    {
      name: 'totalTokens',
      type: 'number',
      defaultValue: 0,
    },
  ],
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
  model?: string
  title?: string
  totalTokens?: number
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
      model: body.model,
      title: body.title ?? 'New conversation',
      totalTokens: body.totalTokens ?? 0,
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

  // Only allow updating specific fields
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    data.title = body.title
  }
  if (body.messages !== undefined) {
    data.messages = body.messages
  }
  if (body.model !== undefined) {
    data.model = body.model
  }
  if (body.totalTokens !== undefined) {
    data.totalTokens = body.totalTokens
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
