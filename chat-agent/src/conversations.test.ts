import { describe, expect, it } from 'vitest'

import {
  conversationEndpoints,
  CONVERSATIONS_SLUG,
  conversationsCollection,
} from './conversations.js'
import { chatAgentPlugin } from './index.js'

// ---------------------------------------------------------------------------
// Collection definition
// ---------------------------------------------------------------------------

describe('conversationsCollection', () => {
  it('has the correct slug', () => {
    expect(conversationsCollection.slug).toBe('chat-conversations')
  })

  it('has required fields', () => {
    const fieldNames = conversationsCollection.fields.map((f: any) => f.name)
    expect(fieldNames).toContain('title')
    expect(fieldNames).toContain('messages')
    expect(fieldNames).toContain('user')
    expect(fieldNames).toContain('model')
    expect(fieldNames).toContain('totalTokens')
  })

  it('has timestamps enabled', () => {
    expect(conversationsCollection.timestamps).toBe(true)
  })

  it('is hidden from admin panel', () => {
    expect(conversationsCollection.admin.hidden).toBe(true)
  })

  it('denies read access without a user', () => {
    const result = conversationsCollection.access.read({ req: { user: null } })
    expect(result).toBe(false)
  })

  it('returns a where constraint for read with a user', () => {
    const result = conversationsCollection.access.read({
      req: { user: { id: 'u1' } },
    })
    expect(result).toEqual({ user: { equals: 'u1' } })
  })

  it('denies create access without a user', () => {
    const result = conversationsCollection.access.create({
      req: { user: null },
    })
    expect(result).toBe(false)
  })

  it('allows create access with a user', () => {
    const result = conversationsCollection.access.create({
      req: { user: { id: 'u1' } },
    })
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

describe('chatAgentPlugin conversations', () => {
  it('registers the chat-conversations collection', () => {
    const plugin = chatAgentPlugin({ apiKey: 'test' })
    const result = plugin({ collections: [], endpoints: [] })
    const slugs = result.collections.map((c: any) => c.slug)
    expect(slugs).toContain(CONVERSATIONS_SLUG)
  })

  it('preserves existing collections', () => {
    const plugin = chatAgentPlugin({ apiKey: 'test' })
    const existing = { slug: 'posts', fields: [] }
    const result = plugin({ collections: [existing], endpoints: [] })
    expect(result.collections).toContainEqual(existing)
  })

  it('registers conversation CRUD endpoints', () => {
    const plugin = chatAgentPlugin({ apiKey: 'test' })
    const result = plugin({ endpoints: [] })
    const paths = result.endpoints.map((ep: any) => `${ep.method}:${ep.path}`)
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

function findHandler(endpoints: any[], method: string, path: string) {
  return endpoints.find((ep: any) => ep.method === method && ep.path === path)?.handler
}

describe('conversation endpoint handlers', () => {
  // --- List ---------------------------------------------------------------

  describe('GET /conversations (list)', () => {
    it('returns 401 without a user', async () => {
      const handler = findHandler(conversationEndpoints, 'get', '/chat-agent/chat/conversations')
      const res = await handler({ user: null })
      expect(res.status).toBe(401)
    })

    it('returns conversations for the user', async () => {
      const docs = [{ id: 'c1', title: 'Test' }]
      const handler = findHandler(conversationEndpoints, 'get', '/chat-agent/chat/conversations')
      const res = await handler({
        payload: {
          find: (args: any) => {
            expect(args.collection).toBe(CONVERSATIONS_SLUG)
            expect(args.where.user.equals).toBe('u1')
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
      const res = await handler({ routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('returns 400 without an id', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await handler({ routeParams: {}, user: { id: 'u1' } })
      expect(res.status).toBe(400)
    })

    it('returns the conversation', async () => {
      const doc = { id: 'c1', messages: [], title: 'Hello' }
      const handler = findHandler(
        conversationEndpoints,
        'get',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await handler({
        payload: {
          findByID: (args: any) => {
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
      const res = await handler({
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
      const res = await handler({ user: null })
      expect(res.status).toBe(401)
    })

    it('creates a conversation with defaults', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      const created = { id: 'c1', messages: [], title: 'New conversation' }
      const res = await handler({
        json: () => Promise.resolve({}),
        payload: {
          create: (args: any) => {
            expect(args.collection).toBe(CONVERSATIONS_SLUG)
            expect(args.data.user).toBe('u1')
            expect(args.data.title).toBe('New conversation')
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
      const res = await handler({
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
      const res = await handler({ routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('updates allowed fields', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      const updated = { id: 'c1', title: 'Updated' }
      const res = await handler({
        json: () => Promise.resolve({ messages: [{ role: 'user' }], title: 'Updated' }),
        payload: {
          update: (args: any) => {
            expect(args.id).toBe('c1')
            expect(args.data.title).toBe('Updated')
            expect(args.data.messages).toEqual([{ role: 'user' }])
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
      const res = await handler({
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
      const res = await handler({ routeParams: { id: 'c1' }, user: null })
      expect(res.status).toBe(401)
    })

    it('deletes the conversation', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'delete',
        '/chat-agent/chat/conversations/:id',
      )
      const res = await handler({
        payload: {
          delete: (args: any) => {
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
      const res = await handler({
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
