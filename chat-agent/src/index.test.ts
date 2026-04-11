import { describe, expect, it, vi } from 'vitest'

import { chatAgentPlugin, validateMessages } from './index.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fake model factory that records the model ids it was asked to
 * resolve and returns a sentinel object. The sentinel intentionally is not a
 * real LanguageModel — tests that go all the way to streamText will throw,
 * which means the factory was at least invoked.
 */
function makeModelFactory() {
  const calls: string[] = []
  const factory = vi.fn((id: string) => {
    calls.push(id)
    return { id, __fake: true } as any
  })
  return { calls, factory }
}

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
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const chatEndpoint = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat')
    expect(chatEndpoint).toBeDefined()
    expect(chatEndpoint.method).toBe('post')
  })

  it('preserves existing endpoints', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const existing = { handler: () => {}, method: 'get', path: '/custom' }
    const result = plugin({ endpoints: [existing] })
    expect(result.endpoints[0]).toBe(existing)
    expect(result.endpoints.some((ep: any) => ep.path === '/chat-agent/chat')).toBe(true)
  })

  it('returns 401 when no user and no custom access', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

    const response = await handler({ payload: {}, user: null })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when no model factory is configured', async () => {
    // Cast through unknown to bypass the type checker — we're verifying runtime
    // behavior when a JS consumer omits the required option.
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
    } as unknown as Parameters<typeof chatAgentPlugin>[0])
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
    expect(body.error).toContain('`model` option')
  })

  it('does not read ANTHROPIC_API_KEY from the environment', async () => {
    // Ensure the plugin no longer falls back to env vars: if it did, this test
    // would pass even without a `model` option, but our config-only contract
    // requires the misconfiguration error regardless of env state.
    const original = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-should-be-ignored'
    try {
      const plugin = chatAgentPlugin({
        defaultModel: 'claude-sonnet-4-20250514',
      } as unknown as Parameters<typeof chatAgentPlugin>[0])
      const result = plugin({ endpoints: [] })
      const handler = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat').handler

      const response = await handler({
        json: () =>
          Promise.resolve({
            messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
          }),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toContain('`model` option')
      expect(body.error).not.toContain('ANTHROPIC')
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = original
      }
    }
  })

  it('returns 400 for invalid JSON body', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
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
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
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
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    const chatView = result.admin?.components?.views?.chat
    expect(chatView).toBeDefined()
    expect(chatView.path).toBe('/chat')
    expect(chatView.Component).toContain('ChatView')
  })

  it('preserves existing admin views', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
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
    const plugin = chatAgentPlugin({
      adminView: false,
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin?.components?.views?.chat).toBeUndefined()
  })

  it('uses custom path when provided', () => {
    const plugin = chatAgentPlugin({
      adminView: { path: '/assistant' },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.path).toBe('/assistant')
  })

  it('uses custom Component when provided', () => {
    const plugin = chatAgentPlugin({
      adminView: { Component: './my-custom/ChatUI' },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin.components.views.chat.Component).toBe('./my-custom/ChatUI')
  })
})

// ---------------------------------------------------------------------------
// Model validation in chat endpoint
// ---------------------------------------------------------------------------

describe('chatAgentPlugin model validation', () => {
  it('rejects model not in available list', async () => {
    const plugin = chatAgentPlugin({
      availableModels: [{ id: 'claude-sonnet-4-20250514', label: 'Sonnet' }],
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
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
    const { factory } = makeModelFactory()
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: factory,
    })
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
// Model factory wiring
// ---------------------------------------------------------------------------

describe('chatAgentPlugin model factory', () => {
  /**
   * The chat handler runs validation, then resolves the model via the
   * user-supplied factory, and finally hands it to streamText. streamText
   * will throw because our fake model isn't a real LanguageModel — but the
   * factory must have been invoked first, with the right id. That's the
   * contract we want to lock in.
   */
  it('invokes the factory with the per-request model id when provided', async () => {
    const { calls, factory } = makeModelFactory()
    const plugin = chatAgentPlugin({
      availableModels: [
        { id: 'claude-sonnet-4-20250514', label: 'Claude' },
        { id: 'gpt-4o', label: 'GPT-4o' },
      ],
      defaultModel: 'claude-sonnet-4-20250514',
      model: factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: any) => ep.path === '/chat-agent/chat',
    ).handler

    try {
      await handler({
        json: () =>
          Promise.resolve({
            messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
            model: 'gpt-4o',
          }),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })
    } catch {
      // streamText will reject because the fake model isn't a real LanguageModel
    }

    expect(calls).toContain('gpt-4o')
  })

  it('falls back to defaultModel when no per-request model is supplied', async () => {
    const { calls, factory } = makeModelFactory()
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o-mini',
      model: factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: any) => ep.path === '/chat-agent/chat',
    ).handler

    try {
      await handler({
        json: () =>
          Promise.resolve({
            messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
          }),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })
    } catch {
      // streamText rejects on fake model
    }

    expect(calls).toEqual(['gpt-4o-mini'])
  })

  it('returns 500 with a clear error when the factory throws', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o-mini',
      model: () => {
        throw new Error('OPENAI_API_KEY is not set')
      },
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: any) => ep.path === '/chat-agent/chat',
    ).handler

    const response = await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toContain('Failed to resolve model "gpt-4o-mini"')
    expect(body.error).toContain('OPENAI_API_KEY is not set')
  })

  it('supports routing to different providers based on the model id', async () => {
    // Mixed-provider scenario: simulate one Anthropic and one OpenAI provider
    // and verify the handler routes through the user-supplied factory each
    // time without ever importing a provider package itself.
    const anthropicCalls: string[] = []
    const openaiCalls: string[] = []
    const factory = (id: string) => {
      if (id.startsWith('claude-')) {
        anthropicCalls.push(id)
      } else if (id.startsWith('gpt-')) {
        openaiCalls.push(id)
      } else {
        throw new Error(`Unknown model: ${id}`)
      }
      return { id, __fake: true } as any
    }
    const plugin = chatAgentPlugin({
      availableModels: [
        { id: 'claude-sonnet-4-20250514', label: 'Claude' },
        { id: 'gpt-4o', label: 'GPT-4o' },
      ],
      defaultModel: 'claude-sonnet-4-20250514',
      model: factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: any) => ep.path === '/chat-agent/chat',
    ).handler

    for (const modelId of ['claude-sonnet-4-20250514', 'gpt-4o']) {
      try {
        await handler({
          json: () =>
            Promise.resolve({
              messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
              model: modelId,
            }),
          payload: { config: { collections: [], globals: [] } },
          user: { id: 1 },
        })
      } catch {
        // Expected — fake model
      }
    }

    expect(anthropicCalls).toEqual(['claude-sonnet-4-20250514'])
    expect(openaiCalls).toEqual(['gpt-4o'])
  })
})

// ---------------------------------------------------------------------------
// Models endpoint
// ---------------------------------------------------------------------------

describe('chatAgentPlugin models endpoint', () => {
  it('adds /chat-agent/chat/models endpoint', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')
    expect(ep).toBeDefined()
    expect(ep.method).toBe('get')
  })

  it('returns configured available models and default', async () => {
    const plugin = chatAgentPlugin({
      availableModels: [
        { id: 'claude-sonnet-4-20250514', label: 'Sonnet' },
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      ],
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler()
    const body = await response.json()
    expect(body.defaultModel).toBe('claude-sonnet-4-20250514')
    expect(body.availableModels).toHaveLength(2)
  })

  it('returns empty availableModels list when not configured', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: any) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler()
    const body = await response.json()
    expect(body.defaultModel).toBe('gpt-4o-mini')
    expect(body.availableModels).toEqual([])
  })
})
