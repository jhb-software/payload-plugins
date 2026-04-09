import { describe, expect, it } from 'vitest'

import { chatAgentPlugin, validateMessages } from '../index.js'

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
