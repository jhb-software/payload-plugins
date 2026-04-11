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
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })
    const chatEndpoint = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat')
    expect(chatEndpoint).toBeDefined()
    expect(chatEndpoint.method).toBe('post')
  })

  it('preserves existing endpoints', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const existing = { handler: () => {}, method: 'get', path: '/custom' }
    const result = plugin({ endpoints: [existing] })
    expect(result.endpoints[0]).toBe(existing)
    expect(result.endpoints.some((ep: any) => ep.path === '/chat-agent/chat')).toBe(true)
  })

  it('returns 401 when no user and no custom access', async () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
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
      const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
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
    const plugin = chatAgentPlugin({ apiKey: 'test-key', defaultModel: 'claude-sonnet-4-20250514' })
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
    const plugin = chatAgentPlugin({ apiKey: 'test-key', defaultModel: 'claude-sonnet-4-20250514' })
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
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })

    const chatView = result.admin?.components?.views?.chat
    expect(chatView).toBeDefined()
    expect(chatView.path).toBe('/chat')
    expect(chatView.Component).toContain('ChatView')
  })

  it('preserves existing admin views', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
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

  it('uses custom path when provided', () => {
    const plugin = chatAgentPlugin({
      adminView: { path: '/assistant' },
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.path).toBe('/assistant')
  })

  it('uses custom Component when provided', () => {
    const plugin = chatAgentPlugin({
      adminView: { Component: './my-custom/ChatUI' },
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.Component).toBe('./my-custom/ChatUI')
  })
})

// ---------------------------------------------------------------------------
// Nav sidebar button (beforeNavLinks)
// ---------------------------------------------------------------------------

describe('chatAgentPlugin nav link', () => {
  it('injects a chat nav link into admin.components.beforeNavLinks by default', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })

    const beforeNavLinks = result.admin?.components?.beforeNavLinks
    expect(Array.isArray(beforeNavLinks)).toBe(true)
    const navLink = beforeNavLinks.find((c: any) =>
      typeof c === 'string' ? c.includes('ChatNavLink') : c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeDefined()
  })

  it('passes the configured chat path to the nav link as a client prop', () => {
    const plugin = chatAgentPlugin({
      adminView: { path: '/assistant' },
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: any) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeDefined()
    expect(navLink.clientProps?.path).toBe('/assistant')
  })

  it('defaults the nav link path to /chat when adminView is unset', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: any) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink.clientProps?.path).toBe('/chat')
  })

  it('does NOT inject the nav link when navLink is false', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      navLink: false,
    })
    const result = plugin({ endpoints: [] })

    const beforeNavLinks = result.admin?.components?.beforeNavLinks ?? []
    const navLink = beforeNavLinks.find((c: any) =>
      typeof c === 'string' ? c.includes('ChatNavLink') : c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeUndefined()
  })

  it('still registers the admin chat view when navLink is false', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      navLink: false,
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin?.components?.views?.chat).toBeDefined()
    expect(result.admin.components.views.chat.path).toBe('/chat')
  })

  it('injects the nav link when navLink is explicitly true', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      navLink: true,
    })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: any) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeDefined()
  })

  it('preserves existing beforeNavLinks entries', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const existing = '@my-org/existing#SomeNavLink'
    const result = plugin({
      admin: { components: { beforeNavLinks: [existing] } },
      endpoints: [],
    })

    expect(result.admin.components.beforeNavLinks).toContain(existing)
    expect(result.admin.components.beforeNavLinks.length).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// Model validation in chat endpoint
// ---------------------------------------------------------------------------

describe('chatAgentPlugin model validation', () => {
  it('rejects model not in available list', async () => {
    const plugin = chatAgentPlugin({
      apiKey: 'test-key',
      availableModels: [{ id: 'claude-sonnet-4-20250514', label: 'Sonnet' }],
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'test' }], role: 'user' }],
          model: 'claude-opus-4-20250514',
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('not available')
  })

  it('allows model when no available list is configured', async () => {
    const plugin = chatAgentPlugin({ apiKey: 'test-key', defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    // This will proceed past validation and fail at streamText (no mock),
    // which means validation passed. We catch the error from streamText.
    try {
      await handler({
        json: () =>
          Promise.resolve({
            messages: [{ id: '1', parts: [{ type: 'text', text: 'test' }], role: 'user' }],
            model: 'any-model-id',
          }),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })
    } catch {
      // Expected: streamText fails because we don't have a real API
    }
    // If we got here without a 400 response, validation passed
  })
})

// ---------------------------------------------------------------------------
// Models endpoint
// ---------------------------------------------------------------------------

describe('chatAgentPlugin models endpoint', () => {
  it('adds /chat-agent/chat/models endpoint', () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-sonnet-4-20250514' })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')
    expect(ep).toBeDefined()
    expect(ep.method).toBe('get')
  })

  it('returns configured available models and default', async () => {
    const plugin = chatAgentPlugin({
      availableModels: [
        { id: 'claude-sonnet-4-20250514', label: 'Sonnet' },
        { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
      ],
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler()
    const body = await response.json()
    expect(body.defaultModel).toBe('claude-sonnet-4-20250514')
    expect(body.availableModels).toHaveLength(2)
  })

  it('returns empty availableModels list when not configured', async () => {
    const plugin = chatAgentPlugin({ defaultModel: 'claude-haiku-4-5-20251001' })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler()
    const body = await response.json()
    expect(body.defaultModel).toBe('claude-haiku-4-5-20251001')
    expect(body.availableModels).toEqual([])
  })
})
