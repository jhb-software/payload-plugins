import type { LanguageModel } from 'ai'
import type {
  AccessArgs,
  CollectionConfig,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
} from 'payload'

import { describe, expect, it } from 'vitest'

import {
  conversationEndpoints,
  CONVERSATIONS_SLUG,
  conversationsCollection,
} from './conversations.js'
import { chatAgentPlugin } from './index.js'

/**
 * Cast helpers for test mocks.
 *
 * The real Payload/AI-SDK types (`AccessArgs.req`, `PayloadRequest`,
 * `LanguageModel`) require 17+ fields. Tests only touch a handful of them,
 * so these helpers route the minimal mock through an explicit cast — a
 * signpost that the partial shape is deliberate.
 */
const asAccessArgs = (v: unknown) => v as AccessArgs
const fakeModel = () => ({}) as unknown as LanguageModel

/**
 * Loose shape for args captured by mocked `payload.find/create/update/...`
 * stubs. Tests only read a few keys (`collection`, `id`, `where`, `data`) —
 * this narrow alias avoids `any` without forcing the full Payload operation
 * types (which are generic over collection slug literal types).
 */
type MockApiArgs = {
  collection?: string
  data?: Record<string, unknown>
  id?: number | string
  where?: Record<string, { equals?: unknown }>
}

/**
 * Shape tests provide for a mocked `PayloadRequest`. Accepting `unknown` on
 * the `payload` and `user` fields lets tests pass minimal stubs (e.g. a
 * custom `payload` whose only job is to capture `find` args) without
 * restating every field of Payload's strict types.
 */
type MockReq = {
  json?: () => Promise<unknown>
  payload?: unknown
  routeParams?: Record<string, unknown>
  user?: unknown
}

/** Call a handler with a partial `PayloadRequest` — avoids per-call casts. */
function callHandler(handler: PayloadHandler, req: MockReq): Promise<Response> | Response {
  return handler(req as unknown as PayloadRequest)
}

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

describe('conversationsCollection', () => {
  it('denies read access without a user', () => {
    const result = conversationsCollection.access!.read!(asAccessArgs({ req: { user: null } }))
    expect(result).toBe(false)
  })

  it('returns a where constraint for read with a user', () => {
    const result = conversationsCollection.access!.read!(
      asAccessArgs({ req: { user: { id: 'u1' } } }),
    )
    expect(result).toEqual({ user: { equals: 'u1' } })
  })

  it('denies create access without a user', () => {
    const result = conversationsCollection.access!.create!(asAccessArgs({ req: { user: null } }))
    expect(result).toBe(false)
  })

  it('allows create access with a user', () => {
    const result = conversationsCollection.access!.create!(
      asAccessArgs({ req: { user: { id: 'u1' } } }),
    )
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

describe('chatAgentPlugin conversations', () => {
  it('registers the chat-conversations collection', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: fakeModel,
    })
    const result = plugin({ collections: [], endpoints: [] })
    const slugs = (result.collections as CollectionConfig[]).map((c) => c.slug)
    expect(slugs).toContain(CONVERSATIONS_SLUG)
  })

  it('preserves existing collections', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: fakeModel,
    })
    const existing = { slug: 'posts', fields: [] }
    const result = plugin({ collections: [existing], endpoints: [] })
    expect(result.collections).toContainEqual(existing)
  })

  it('registers conversation CRUD endpoints', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: fakeModel,
    })
    const result = plugin({ endpoints: [] })
    const paths = (result.endpoints as Endpoint[]).map((ep) => `${ep.method}:${ep.path}`)
    expect(paths).toContain('get:/chat-agent/chat/conversations')
    expect(paths).toContain('get:/chat-agent/chat/conversations/:id')
    expect(paths).toContain('post:/chat-agent/chat/conversations')
    expect(paths).toContain('patch:/chat-agent/chat/conversations/:id')
    expect(paths).toContain('delete:/chat-agent/chat/conversations/:id')
  })
})

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

function findHandler(endpoints: Endpoint[], method: string, path: string): PayloadHandler {
  const handler = endpoints.find((ep) => ep.method === method && ep.path === path)?.handler
  if (!handler) {
    throw new Error(`No endpoint handler registered for ${method} ${path}`)
  }
  return handler
}

/** Builds a payload.config.custom.chatAgent.access shape for handler tests. */
function payloadWithAccess(
  access: (req: PayloadRequest) => boolean | Promise<boolean>,
  extra: Record<string, unknown> = {},
) {
  return { config: { custom: { chatAgent: { access } } }, ...extra }
}

describe('conversation endpoints respect plugin access()', () => {
  it.each([
    ['get', '/chat-agent/chat/conversations'],
    ['get', '/chat-agent/chat/conversations/:id'],
    ['post', '/chat-agent/chat/conversations'],
    ['patch', '/chat-agent/chat/conversations/:id'],
    ['delete', '/chat-agent/chat/conversations/:id'],
  ])('%s %s returns 401 when plugin access denies', async (method, path) => {
    const handler = findHandler(conversationEndpoints, method, path)
    const res = await callHandler(handler, {
      json: () => Promise.resolve({}),
      payload: payloadWithAccess(() => false),
      routeParams: { id: 'c1' },
      user: { id: 'u1' },
    })
    expect(res.status).toBe(401)
  })
})

describe('conversation endpoint handlers', () => {
  // --- List ---------------------------------------------------------------

  describe('GET /conversations (list)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(conversationEndpoints, 'get', '/chat-agent/chat/conversations')
      const res = await callHandler(handler, { user: null })
      expect(res.status).toBe(401)
    })

    it('returns conversations for the user', async () => {
      const docs = [{ id: 'c1', title: 'Test' }]
      const handler = findHandler(conversationEndpoints, 'get', '/chat-agent/chat/conversations')
      const res = await callHandler(handler, {
        payload: {
          find: (args: MockApiArgs) => {
            expect(args.collection).toBe(CONVERSATIONS_SLUG)
            expect(args.where?.user?.equals).toBe('u1')
            return { docs }
          },
        },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.docs).toEqual(docs)
    })
  })

  // --- Get ----------------------------------------------------------------

  describe('GET /conversations/:id (get)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, { routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('returns 400 without an id', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, { routeParams: {}, user: { id: 'u1' } })
      expect(res.status).toBe(400)
    })

    it('returns the conversation', async () => {
      const doc = { id: 'c1', messages: [], title: 'Hello' }
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, {
        payload: {
          findByID: (args: MockApiArgs) => {
            expect(args.collection).toBe(CONVERSATIONS_SLUG)
            expect(args.id).toBe('c1')
            return doc
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(doc)
    })

    it('returns 404 when not found', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, {
        payload: {
          findByID: () => {
            throw new Error('Not Found')
          },
        },
        routeParams: { id: 'nope' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Create -------------------------------------------------------------

  describe('POST /conversations (create)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      const res = await callHandler(handler, { user: null })
      expect(res.status).toBe(401)
    })

    it('creates a conversation with defaults', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      const created = { id: 'c1', messages: [], title: 'New conversation' }
      const res = await callHandler(handler, {
        json: () => Promise.resolve({}),
        payload: {
          create: (args: MockApiArgs) => {
            expect(args.collection).toBe(CONVERSATIONS_SLUG)
            expect(args.data?.user).toBe('u1')
            expect(args.data?.title).toBe('New conversation')
            return created
          },
        },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual(created)
    })

    it('returns 400 for invalid JSON', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      const res = await callHandler(handler, {
        json: () => Promise.reject(new Error('bad')),
        user: { id: 'u1' },
      })
      expect(res.status).toBe(400)
    })
  })

  // --- Update -------------------------------------------------------------

  describe('PATCH /conversations/:id (update)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, { routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('updates allowed fields', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      const updated = { id: 'c1', title: 'Updated' }
      const res = await callHandler(handler, {
        json: () => Promise.resolve({ messages: [{ role: 'user' }], title: 'Updated' }),
        payload: {
          update: (args: MockApiArgs) => {
            expect(args.id).toBe('c1')
            expect(args.data?.title).toBe('Updated')
            expect(args.data?.messages).toEqual([{ role: 'user' }])
            return updated
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
    })

    it('returns 404 when not found', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, {
        json: () => Promise.resolve({ title: 'x' }),
        payload: {
          update: () => {
            throw new Error('Not Found')
          },
        },
        routeParams: { id: 'nope' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Delete -------------------------------------------------------------

  describe('DELETE /conversations/:id (delete)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'delete',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, { routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('deletes the conversation', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'delete',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, {
        payload: {
          delete: (args: MockApiArgs) => {
            expect(args.id).toBe('c1')
            return { id: 'c1' }
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ deleted: true })
    })

    it('returns 404 when not found', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'delete',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await callHandler(handler, {
        payload: {
          delete: () => {
            throw new Error('Not Found')
          },
        },
        routeParams: { id: 'nope' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(404)
    })
  })
})
