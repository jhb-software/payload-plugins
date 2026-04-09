import { describe, expect, it } from 'vitest'

import { chatAgentPlugin, validateMessages } from './index.js'

// ---------------------------------------------------------------------------
// validateMessages
// ---------------------------------------------------------------------------

describe('validateMessages', () => {
  it('returns null for valid UIMessage format', () => {
    expect(
      validateMessages([{ id: '1', parts: [{ type: 'text', text: 'Hi' }], role: 'user' }]),
    ).toBeNull()
  })

  it('returns null for simple role+content messages', () => {
    expect(validateMessages([{ content: 'Hello', role: 'user' }])).toBeNull()
  })

  it('rejects non-array', () => {
    expect(validateMessages('not an array')).toContain('must be an array')
    expect(validateMessages(null)).toContain('must be an array')
    expect(validateMessages(42)).toContain('must be an array')
  })

  it('rejects empty array', () => {
    expect(validateMessages([])).toContain('must not be empty')
  })

  it('rejects missing role', () => {
    const err = validateMessages([{ content: 'test' }])
    expect(err).toContain('role')
  })

  it('rejects non-object messages', () => {
    const err = validateMessages(['just a string'])
    expect(err).toContain('must be an object')
  })

  it('rejects null messages in array', () => {
    const err = validateMessages([null])
    expect(err).toContain('must be an object')
  })
})

// ---------------------------------------------------------------------------
// chatAgentPlugin config transform
// ---------------------------------------------------------------------------

describe('chatAgentPlugin', () => {
  it('adds /chat-agent/chat endpoint to config', () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const chatEndpoint = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat')
    expect(chatEndpoint).toBeDefined()
    expect(chatEndpoint.method).toBe('post')
  })

  it('preserves existing endpoints', () => {
    const plugin = chatAgentPlugin()
    const existing = { handler: () => {}, method: 'get', path: '/custom' }
    const result = plugin({ endpoints: [existing] })
    expect(result.endpoints[0]).toBe(existing)
    expect(result.endpoints.some((ep: any) => ep.path === '/chat-agent/chat')).toBe(true)
  })

  it('returns 401 when no user and no custom access', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({ payload: {}, user: null })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when no API key configured', async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    try {
      const plugin = chatAgentPlugin()
      const result = plugin({ endpoints: [] })
      const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

      const response = await handler({
        json: () =>
          Promise.resolve({
            messages: [
              {
                id: '1',
                parts: [{ type: 'text', text: 'test' }],
                role: 'user',
              },
            ],
          }),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toContain('API key')
    } finally {
      if (original !== undefined) {
        process.env.ANTHROPIC_API_KEY = original
      }
    }
  })

  it('returns 400 for invalid JSON body', async () => {
    const plugin = chatAgentPlugin({ apiKey: 'test-key' })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () => Promise.reject(new Error('Invalid JSON')),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 for empty messages array', async () => {
    const plugin = chatAgentPlugin({ apiKey: 'test-key' })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () => Promise.resolve({ messages: [] }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('must not be empty')
  })
})

// ---------------------------------------------------------------------------
// Mode-related endpoint tests
// ---------------------------------------------------------------------------

describe('chatAgentPlugin modes', () => {
  it('registers a GET /chat-agent/modes endpoint', () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const modesEndpoint = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes')
    expect(modesEndpoint).toBeDefined()
    expect(modesEndpoint.method).toBe('get')
  })

  it('registers a POST /chat-agent/execute-tool endpoint', () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const execEndpoint = result.endpoints.find((ep: any) => ep.path === '/chat-agent/execute-tool')
    expect(execEndpoint).toBeDefined()
    expect(execEndpoint.method).toBe('post')
  })

  it('modes endpoint returns 401 without auth', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: null })
    expect(response.status).toBe(401)
  })

  it('modes endpoint returns default modes for authenticated user', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.modes).toEqual(['read', 'ask', 'read-write'])
    expect(body.default).toBe('ask')
  })

  it('modes endpoint includes superuser when configured', async () => {
    const plugin = chatAgentPlugin({
      modes: {
        access: { superuser: () => true },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    const body = await response.json()
    expect(body.modes).toContain('superuser')
  })

  it('modes endpoint respects access functions', async () => {
    const plugin = chatAgentPlugin({
      modes: {
        access: {
          'read-write': ({ req }) => req.user?.role === 'admin',
        },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes').handler

    // Non-admin user
    const res1 = await handler({ user: { id: 'u1', role: 'editor' } })
    const body1 = await res1.json()
    expect(body1.modes).not.toContain('read-write')

    // Admin user
    const res2 = await handler({ user: { id: 'u2', role: 'admin' } })
    const body2 = await res2.json()
    expect(body2.modes).toContain('read-write')
  })

  it('modes endpoint returns custom default mode', async () => {
    const plugin = chatAgentPlugin({
      modes: { default: 'read-write' },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    const body = await response.json()
    expect(body.default).toBe('read-write')
  })

  it('chat endpoint rejects invalid mode', async () => {
    const plugin = chatAgentPlugin({ apiKey: 'test-key' })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'test' }], role: 'user' }],
          mode: 'invalid',
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toContain('Invalid mode')
  })

  it('chat endpoint rejects mode user lacks access to', async () => {
    const plugin = chatAgentPlugin({
      apiKey: 'test-key',
      modes: {
        access: {
          superuser: () => false,
        },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'test' }], role: 'user' }],
          mode: 'superuser',
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toContain('Access denied')
  })

  it('execute-tool endpoint returns 401 without auth', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find(
      (ep: any) => ep.path === '/chat-agent/execute-tool',
    ).handler

    const response = await handler({ user: null })
    expect(response.status).toBe(401)
  })

  it('execute-tool endpoint rejects non-write tools', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find(
      (ep: any) => ep.path === '/chat-agent/execute-tool',
    ).handler

    const response = await handler({
      json: () => Promise.resolve({ input: { collection: 'posts' }, toolName: 'find' }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 'u1' },
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('not a write tool')
  })

  it('execute-tool endpoint executes a write tool', async () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find(
      (ep: any) => ep.path === '/chat-agent/execute-tool',
    ).handler

    const mockCreate = { id: 'new-1', title: 'Test' }
    const response = await handler({
      json: () =>
        Promise.resolve({
          input: { collection: 'posts', data: { title: 'Test' } },
          toolCallId: 'tc-1',
          toolName: 'create',
        }),
      payload: {
        config: { collections: [], globals: [] },
        create: () => Promise.resolve(mockCreate),
      },
      user: { id: 'u1' },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result).toEqual(mockCreate)
  })
})

// ---------------------------------------------------------------------------
// Admin view auto-registration
// ---------------------------------------------------------------------------

describe('chatAgentPlugin admin view', () => {
  it('auto-registers the chat view at /chat by default', () => {
    const plugin = chatAgentPlugin()
    const result = plugin({ endpoints: [] })

    const chatView = result.admin?.components?.views?.chat
    expect(chatView).toBeDefined()
    expect(chatView.path).toBe('/chat')
    expect(chatView.Component).toContain('ChatView')
  })

  it('preserves existing admin views', () => {
    const plugin = chatAgentPlugin()
    const result = plugin({
      admin: {
        components: {
          views: {
            dashboard: { Component: './Dashboard', path: '/dashboard' },
          },
        },
      },
      endpoints: [],
    })

    expect(result.admin.components.views.dashboard).toBeDefined()
    expect(result.admin.components.views.chat).toBeDefined()
  })

  it('disables admin view when adminView is false', () => {
    const plugin = chatAgentPlugin({ adminView: false })
    const result = plugin({ endpoints: [] })

    expect(result.admin?.components?.views?.chat).toBeUndefined()
  })

  it('uses custom path when provided', () => {
    const plugin = chatAgentPlugin({ adminView: { path: '/assistant' } })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.path).toBe('/assistant')
  })

  it('uses custom Component when provided', () => {
    const plugin = chatAgentPlugin({
      adminView: { Component: './my-custom/ChatUI' },
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.Component).toBe('./my-custom/ChatUI')
  })
})
