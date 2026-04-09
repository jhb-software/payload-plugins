/**
 * Conversation persistence for the chat agent plugin.
 *
 * Defines the Payload collection and REST endpoint handlers for
 * storing and retrieving chat conversations.
 *
 * Types are kept inline to avoid a hard dependency on `payload`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONVERSATIONS_SLUG = 'chat-conversations'

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

export const conversationsCollection = {
  slug: CONVERSATIONS_SLUG,
  admin: {
    useAsTitle: 'title',
    group: 'Chat',
    hidden: true,
  },
  timestamps: true,
  access: {
    read: ({ req }: any) => {
      if (!req.user) return false
      return { user: { equals: req.user.id } }
    },
    create: ({ req }: any) => !!req.user,
    update: ({ req }: any) => {
      if (!req.user) return false
      return { user: { equals: req.user.id } }
    },
    delete: ({ req }: any) => {
      if (!req.user) return false
      return { user: { equals: req.user.id } }
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      defaultValue: 'New conversation',
    },
    {
      name: 'messages',
      type: 'json',
      required: true,
      defaultValue: [],
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: { readOnly: true },
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
}

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

/** GET /api/chat-agent/chat/conversations — list user's conversations */
async function listConversations(req: any): Promise<Response> {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await req.payload.find({
    collection: CONVERSATIONS_SLUG,
    where: { user: { equals: req.user.id } },
    sort: '-updatedAt',
    limit: 50,
    depth: 0,
  })

  return Response.json(result)
}

/** GET /api/chat-agent/chat/conversations/:id — get single conversation */
async function getConversation(req: any): Promise<Response> {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (!id) {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  try {
    const doc = await req.payload.findByID({
      collection: CONVERSATIONS_SLUG,
      id,
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
  if (!req.user) {
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
      title: body.title ?? 'New conversation',
      messages: body.messages ?? [],
      user: req.user.id,
      model: body.model,
      totalTokens: body.totalTokens ?? 0,
    },
  })

  return Response.json(doc, { status: 201 })
}

/** PATCH /api/chat-agent/chat/conversations/:id — update a conversation */
async function updateConversation(req: any): Promise<Response> {
  if (!req.user) {
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
  if (body.title !== undefined) data.title = body.title
  if (body.messages !== undefined) data.messages = body.messages
  if (body.model !== undefined) data.model = body.model
  if (body.totalTokens !== undefined) data.totalTokens = body.totalTokens

  try {
    const doc = await req.payload.update({
      collection: CONVERSATIONS_SLUG,
      id,
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
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.routeParams?.id
  if (!id) {
    return Response.json({ error: 'Missing conversation ID' }, { status: 400 })
  }

  try {
    await req.payload.delete({
      collection: CONVERSATIONS_SLUG,
      id,
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
    path: '/chat-agent/chat/conversations',
    method: 'get' as const,
    handler: listConversations,
  },
  {
    path: '/chat-agent/chat/conversations/:id',
    method: 'get' as const,
    handler: getConversation,
  },
  {
    path: '/chat-agent/chat/conversations',
    method: 'post' as const,
    handler: createConversation,
  },
  {
    path: '/chat-agent/chat/conversations/:id',
    method: 'patch' as const,
    handler: updateConversation,
  },
  {
    path: '/chat-agent/chat/conversations/:id',
    method: 'delete' as const,
    handler: deleteConversation,
  },
]
