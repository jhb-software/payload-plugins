/**
 * Conversation persistence for the chat agent plugin.
 *
 * Defines the Payload collection and REST endpoint handlers for
 * storing and retrieving chat conversations.
 *
 * Types are kept inline to avoid a hard dependency on `payload`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isPluginAccessAllowed } from './access.js'

export const CONVERSATIONS_SLUG = 'chat-conversations'

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

export const conversationsCollection = {
  slug: CONVERSATIONS_SLUG,
  access: {
    create: ({ req }: any) => !!req.user,
    delete: ({ req }: any) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
    read: ({ req }: any) => {
      if (!req.user) {
        return false
      }
      return { user: { equals: req.user.id } }
    },
    update: ({ req }: any) => {
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
async function listConversations(req: any): Promise<Response> {
  if (!(await isPluginAccessAllowed(req))) {
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
async function getConversation(req: any): Promise<Response> {
  if (!(await isPluginAccessAllowed(req))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (!id) {
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

/** POST /api/chat-agent/chat/conversations — create a conversation */
async function createConversation(req: any): Promise<Response> {
  if (!(await isPluginAccessAllowed(req))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
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
async function updateConversation(req: any): Promise<Response> {
  if (!(await isPluginAccessAllowed(req))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (!id) {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  let body: any
  try {
    body = await req.json()
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
async function deleteConversation(req: any): Promise<Response> {
  if (!(await isPluginAccessAllowed(req))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (!id) {
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

export const conversationEndpoints = [
  {
    handler: listConversations,
    method: 'get' as const,
    path: '/chat-agent/chat/conversations',
  },
  {
    handler: getConversation,
    method: 'get' as const,
    path: '/chat-agent/chat/conversations/:id',
  },
  {
    handler: createConversation,
    method: 'post' as const,
    path: '/chat-agent/chat/conversations',
  },
  {
    handler: updateConversation,
    method: 'patch' as const,
    path: '/chat-agent/chat/conversations/:id',
  },
  {
    handler: deleteConversation,
    method: 'delete' as const,
    path: '/chat-agent/chat/conversations/:id',
  },
]
