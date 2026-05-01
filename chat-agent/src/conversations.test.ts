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

  // Without this hook, a user who hits Payload's default collection REST
  // (`POST /api/agent-conversations`) could send `data.user = '<other-id>'`.
  // Access filters would still hide the record from them, but the
  // collection would end up with records owned by someone who never
  // created them. The hook forces `data.user` to the authenticated user
  // on every create/update so the ownership field is server-authoritative.
  describe('beforeValidate forces data.user to the authenticated user', () => {
    // `beforeValidate` is a `CollectionBeforeValidateHook`, which is a
    // discriminated-union return type (data | Promise<data>). The tests
    // invoke it synchronously with known shapes, so the loose cast
    // documents the intentional narrowing rather than restating the full
    // hook signature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hook = conversationsCollection.hooks!.beforeValidate![0] as any

    it('overwrites data.user on create even when client supplies another id', async () => {
      const result = await hook({
        data: { messages: [], title: 'hi', user: 'someone-else' },
        operation: 'create',
        req: { user: { id: 'me' } },
      })
      expect(result.user).toBe('me')
    })

    it('overwrites data.user on update even when client supplies another id', async () => {
      const result = await hook({
        data: { title: 'renamed', user: 'someone-else' },
        operation: 'update',
        req: { user: { id: 'me' } },
      })
      expect(result.user).toBe('me')
    })

    it('leaves data untouched when there is no authenticated user', async () => {
      const data = { title: 'hi', user: 'preserved' }
      const result = await hook({ data, operation: 'create', req: { user: null } })
      expect(result).toEqual(data)
    })
  })

  // The read access filter and the sidebar list query both filter by
  // `user = currentUser.id`. Without a DB index on the `user` relationship,
  // every list request degrades to a full scan + sort — noticeable once the
  // collection has more than a few hundred rows.
  it('indexes the user field so read-access and list queries hit an index', () => {
    const userField = conversationsCollection.fields.find(
      (f): f is { index?: boolean; name: string } & typeof f => 'name' in f && f.name === 'user',
    )
    expect(userField?.index).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

describe('chatAgentPlugin conversations', () => {
  it('registers the agent-conversations collection', () => {
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

/** Builds a payload.config.custom.chatAgent shape carrying `access` for handler tests. */
function payloadWithAccess(
  access: (req: PayloadRequest) => boolean | Promise<boolean>,
  extra: Record<string, unknown> = {},
) {
  return { config: { custom: { chatAgent: { pluginOptions: { access } } } }, ...extra }
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

    // The sidebar only renders `id`, `title`, and `updatedAt`. Without a
    // `select`, Payload returns the full `messages` JSON on every doc — which
    // for long-running users can be many MB on each page load. Lock in the
    // select shape so a future refactor can't silently re-widen the query.
    it('fetches only the fields the sidebar renders (title + updatedAt)', async () => {
      let captured: MockApiArgs | undefined
      const handler = findHandler(conversationEndpoints, 'get', '/chat-agent/chat/conversations')
      await callHandler(handler, {
        payload: {
          find: (args: MockApiArgs) => {
            captured = args
            return { docs: [] }
          },
        },
        user: { id: 'u1' },
      })
      expect((captured as unknown as { select?: Record<string, boolean> }).select).toEqual({
        title: true,
        updatedAt: true,
      })
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

    // If `totalTokens` were honored as-is from the client, a user could send
    // `{ totalTokens: 0 }` alongside a long conversation and desync the
    // recorded usage metric from what was actually consumed. The server
    // derives it by summing `metadata.totalTokens` on the provided messages
    // instead — the source of truth is the server-streamed message metadata,
    // so the total stays consistent with the message list.
    // Mode is persisted per conversation so reloading a chat restores the
    // user's selected escalation level. Without this, a user who dropped to
    // `read` for safety would silently fall back to `modes.default` after a
    // page reload.
    it('persists the agent mode when provided', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      let captured: MockApiArgs | undefined
      const res = await callHandler(handler, {
        json: () => Promise.resolve({ messages: [], mode: 'read-write' }),
        payload: {
          create: (args: MockApiArgs) => {
            captured = args
            return { id: 'c1' }
          },
        },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(201)
      expect(captured?.data?.mode).toBe('read-write')
    })

    it('derives totalTokens from message metadata, ignoring client-supplied totalTokens', async () => {
      const handler = findHandler(conversationEndpoints, 'post', '/chat-agent/chat/conversations')
      let captured: MockApiArgs | undefined
      const res = await callHandler(handler, {
        json: () =>
          Promise.resolve({
            messages: [
              { metadata: { totalTokens: 120 }, role: 'assistant' },
              { metadata: { totalTokens: 80 }, role: 'assistant' },
              { role: 'user' },
            ],
            totalTokens: 9999,
          }),
        payload: {
          create: (args: MockApiArgs) => {
            captured = args
            return { id: 'c1' }
          },
        },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(201)
      expect(captured?.data?.totalTokens).toBe(200)
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

    // The PATCH handler must never write a client-supplied `totalTokens`.
    // See the create-handler test for the equivalent guard on the POST
    // route — the same reasoning applies here (server-derived, message-
    // consistent usage metric).
    // Mirrors the create-handler guarantee: PATCH must write the `mode` when
    // the client sends it so a reload-restored conversation resumes in the
    // same mode it was last used in.
    it('persists the agent mode when provided', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      let captured: MockApiArgs | undefined
      const res = await callHandler(handler, {
        json: () => Promise.resolve({ mode: 'read' }),
        payload: {
          update: (args: MockApiArgs) => {
            captured = args
            return { id: 'c1' }
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
      expect(captured?.data?.mode).toBe('read')
    })

    it('ignores client-supplied totalTokens and derives from message metadata', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      let captured: MockApiArgs | undefined
      const res = await callHandler(handler, {
        json: () =>
          Promise.resolve({
            messages: [
              { metadata: { totalTokens: 50 }, role: 'assistant' },
              { metadata: { totalTokens: 30 }, role: 'assistant' },
            ],
            totalTokens: 9999,
          }),
        payload: {
          update: (args: MockApiArgs) => {
            captured = args
            return { id: 'c1' }
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      expect(res.status).toBe(200)
      expect(captured?.data?.totalTokens).toBe(80)
    })

    it('does not write totalTokens when messages are not part of the update', async () => {
      const handler = findHandler(
        conversationEndpoints,
        'patch',
        '/chat-agent/chat/conversations/:id',
      )
      let captured: MockApiArgs | undefined
      await callHandler(handler, {
        json: () => Promise.resolve({ title: 'renamed', totalTokens: 9999 }),
        payload: {
          update: (args: MockApiArgs) => {
            captured = args
            return { id: 'c1' }
          },
        },
        routeParams: { id: 'c1' },
        user: { id: 'u1' },
      })
      // totalTokens is only written when messages change, so a pure rename
      // leaves the existing aggregate untouched.
      expect(captured?.data).not.toHaveProperty('totalTokens')
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
