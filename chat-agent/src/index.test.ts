import type { LanguageModel } from 'ai'
import type { Endpoint } from 'payload'

import { streamText } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { chatAgentPlugin, validateMessages } from './index.js'

/**
 * Structural type for entries in `config.admin.components.beforeNavLinks`.
 * Payload's real `CustomComponent` type is a deep union; tests only read
 * `path` and `clientProps.path`, so this narrow shape keeps callbacks typed
 * without pulling in the full Payload component machinery.
 */
type NavLinkEntry = { clientProps?: { path?: string }; path?: string } | string

// Mock the `ai` module so the chat handler doesn't actually try to talk to a
// provider. We keep every other export real (`convertToModelMessages`,
// `stepCountIs`, …) and only swap `streamText` for a vi.fn whose return value
// satisfies the handler's `result.toUIMessageStreamResponse(...)` call.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: () => new Response('ok'),
    })),
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fake model factory that records the model ids it was asked to
 * resolve and returns a sentinel `LanguageModel`-shaped object. We never let
 * the sentinel reach a real provider — `streamText` is mocked above — so
 * tests can assert on the factory's call log and on the exact instance the
 * handler hands to `streamText`.
 */
/**
 * The sentinel is typed as `LanguageModel` only at the boundary — its real
 * shape (`{ id, __fake }`) never reaches a provider, because `streamText`
 * is mocked. The cast via `unknown` is the deliberate bridge between a test
 * stub and the AI SDK's deep `LanguageModel` interface.
 */
function makeModelFactory() {
  const calls: string[] = []
  const factory = vi.fn((id: string): LanguageModel => {
    calls.push(id)
    return { id, __fake: true } as unknown as LanguageModel
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
  it('throws at construction when defaultModel is not in availableModels', () => {
    // A typo or copy-paste mistake here would otherwise produce confusing
    // runtime behavior: the dropdown would list one set of models while
    // unsupplied requests silently fall back to a model the UI never offers.
    // Fail fast at config load time instead.
    expect(() =>
      chatAgentPlugin({
        availableModels: [
          { id: 'gpt-4o', label: 'GPT-4o' },
          { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        ],
        defaultModel: 'gpt-5-typo',
        model: makeModelFactory().factory,
      }),
    ).toThrow(/defaultModel.*"gpt-5-typo".*availableModels/)
  })

  it('does not enforce defaultModel membership when availableModels is omitted', () => {
    // Without an availableModels list there's no UI selector and no
    // user-facing inconsistency to guard against — any id is allowed.
    expect(() =>
      chatAgentPlugin({
        defaultModel: 'whatever-id',
        model: makeModelFactory().factory,
      }),
    ).not.toThrow()
  })

  it('adds /chat-agent/chat endpoint to config', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const chatEndpoint = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat')
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
    expect(result.endpoints.some((ep: Endpoint) => ep.path === '/chat-agent/chat')).toBe(true)
  })

  it('returns 401 when no user and no custom access', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

    const response = await handler({ payload: {}, user: null })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when no model factory is configured', async () => {
    // Verify runtime behavior when a JS consumer omits the required option.
    // @ts-expect-error - intentionally missing required `model` to test runtime guard
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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
      // @ts-expect-error - intentionally missing required `model` to test runtime guard
      const plugin = chatAgentPlugin({
        defaultModel: 'claude-sonnet-4-20250514',
      })
      const result = plugin({ endpoints: [] })
      const handler = result.endpoints.find(
        (ep: Endpoint) => ep.path === '/chat-agent/chat',
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
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const modesEndpoint = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes')
    expect(modesEndpoint).toBeDefined()
    expect(modesEndpoint.method).toBe('get')
  })

  it('modes endpoint returns 401 without auth', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: null })
    expect(response.status).toBe(401)
  })

  it('modes endpoint returns default modes for authenticated user', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.modes).toEqual(['read', 'ask', 'read-write'])
    expect(body.default).toBe('ask')
  })

  it('modes endpoint includes superuser when configured', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      modes: {
        access: { superuser: () => true },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    const body = await response.json()
    expect(body.modes).toContain('superuser')
  })

  it('modes endpoint respects access functions', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      modes: {
        access: {
          'read-write': ({ req }) => req.user?.role === 'admin',
        },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler

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
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler

    const response = await handler({ user: { id: 'u1' } })
    const body = await response.json()
    expect(body.default).toBe('read-write')
  })

  it('chat endpoint rejects invalid mode', async () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      modes: {
        access: {
          superuser: () => false,
        },
      },
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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
// Nav sidebar button (beforeNavLinks)
// ---------------------------------------------------------------------------

describe('chatAgentPlugin nav link', () => {
  it('injects a chat nav link into admin.components.beforeNavLinks by default', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    const beforeNavLinks = result.admin?.components?.beforeNavLinks
    expect(Array.isArray(beforeNavLinks)).toBe(true)
    const navLink = beforeNavLinks.find((c: NavLinkEntry) =>
      typeof c === 'string' ? c.includes('ChatNavLink') : c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeDefined()
  })

  it('passes the configured chat path to the nav link as a client prop', () => {
    const plugin = chatAgentPlugin({
      adminView: { path: '/assistant' },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: NavLinkEntry) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeDefined()
    expect(navLink.clientProps?.path).toBe('/assistant')
  })

  it('defaults the nav link path to /chat when adminView is unset', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: NavLinkEntry) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink.clientProps?.path).toBe('/chat')
  })

  it('does NOT inject the nav link when navLink is false', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      navLink: false,
    })
    const result = plugin({ endpoints: [] })

    const beforeNavLinks = result.admin?.components?.beforeNavLinks ?? []
    const navLink = beforeNavLinks.find((c: NavLinkEntry) =>
      typeof c === 'string' ? c.includes('ChatNavLink') : c?.path?.includes('ChatNavLink'),
    )
    expect(navLink).toBeUndefined()
  })

  it('still registers the admin chat view when navLink is false', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
      navLink: false,
    })
    const result = plugin({ endpoints: [] })

    expect(result.admin?.components?.views?.chat).toBeDefined()
    expect(result.admin.components.views.chat.path).toBe('/chat')
  })

  it('uses a server component for the nav link', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    const navLink = result.admin.components.beforeNavLinks.find(
      (c: NavLinkEntry) => typeof c === 'object' && c?.path?.includes('ChatNavLink'),
    )
    expect(navLink.path).toContain('ChatNavLinkServer')
    expect(navLink.path).not.toContain('/client')
  })

  it('stores the access function in config.custom.chatAgent', () => {
    const access = () => true
    const plugin = chatAgentPlugin({
      access,
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })

    expect(result.custom?.chatAgent?.access).toBe(access)
  })

  it('preserves existing beforeNavLinks entries', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
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
      availableModels: [{ id: 'claude-sonnet-4-20250514', label: 'Sonnet' }],
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

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

  it('allows any model id when no available list is configured', async () => {
    // Observable behavior: without availableModels, the plugin must not
    // 400 on an unknown model id — it should pass through to the factory.
    // We detect "validation passed" by watching the factory get called;
    // a rejecting 400 would short-circuit before that.
    const { calls, factory } = makeModelFactory()
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: factory,
    })
    const result = plugin({ endpoints: [] })
    const handler = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler

    const response = await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'test' }], role: 'user' }],
          model: 'any-model-id',
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(response.status).not.toBe(400)
    expect(calls).toContain('any-model-id')
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
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
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
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
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
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
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

  it('passes the LanguageModel returned by the factory directly to streamText', async () => {
    // The factory's *return value* must be the model instance streamText
    // sees. A refactor that called the factory but forgot to wire the result
    // through would silently break — this test locks the contract.
    vi.mocked(streamText).mockClear()

    const sentinel = {
      id: 'gpt-4o',
      __fake: true,
      sentinel: Symbol('marker'),
    } as unknown as LanguageModel
    const factory = vi.fn(() => sentinel)
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(streamText).mock.calls[0][0]
    expect(callArgs.model).toBe(sentinel)
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
      return { id, __fake: true } as unknown as LanguageModel
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
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
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
    const ep = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat/models')
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
    const ep = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler({ user: { id: 1 } })
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
    const ep = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler({ user: { id: 1 } })
    const body = await response.json()
    expect(body.defaultModel).toBe('gpt-4o-mini')
    expect(body.availableModels).toEqual([])
  })

  it('returns 401 when plugin access() denies', async () => {
    const plugin = chatAgentPlugin({
      access: () => false,
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })
    const config = plugin({ endpoints: [] })
    const ep = config.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat/models')

    const response = await ep.handler({
      payload: { config: { custom: config.custom } },
      user: { id: 1 },
    })
    expect(response.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Plugin-level access() gates every surface
// ---------------------------------------------------------------------------

describe('chatAgentPlugin access()', () => {
  // When an authenticated user is present but the plugin's access() returns
  // false, every chat-agent endpoint must refuse. Before the fix, only the
  // modes + chat endpoints honored access(); /models and the conversation
  // CRUD routes still worked for any logged-in user.
  const denyingPlugin = () =>
    chatAgentPlugin({
      access: () => false,
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

  it('denies /chat-agent/modes', async () => {
    const config = denyingPlugin()({ endpoints: [] })
    const handler = config.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/modes').handler
    const response = await handler({
      payload: { config: { custom: config.custom } },
      user: { id: 1 },
    })
    expect(response.status).toBe(401)
  })

  it('denies /chat-agent/chat', async () => {
    const config = denyingPlugin()({ endpoints: [] })
    const handler = config.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/chat').handler
    const response = await handler({
      json: () => Promise.resolve({ messages: [] }),
      payload: { config: { custom: config.custom } },
      user: { id: 1 },
    })
    expect(response.status).toBe(401)
  })

  it('denies /chat-agent/chat/models', async () => {
    const config = denyingPlugin()({ endpoints: [] })
    const handler = config.endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat/models',
    ).handler
    const response = await handler({
      payload: { config: { custom: config.custom } },
      user: { id: 1 },
    })
    expect(response.status).toBe(401)
  })

  it('denies every conversation CRUD endpoint', async () => {
    const config = denyingPlugin()({ endpoints: [] })
    const payload = { config: { custom: config.custom } }
    const routes = [
      ['get', '/chat-agent/chat/conversations'],
      ['get', '/chat-agent/chat/conversations/:id'],
      ['post', '/chat-agent/chat/conversations'],
      ['patch', '/chat-agent/chat/conversations/:id'],
      ['delete', '/chat-agent/chat/conversations/:id'],
    ] as const
    for (const [method, path] of routes) {
      const handler = config.endpoints.find(
        (ep: Endpoint) => ep.method === method && ep.path === path,
      ).handler
      const response = await handler({
        json: () => Promise.resolve({}),
        payload,
        routeParams: { id: 'c1' },
        user: { id: 1 },
      })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })
})
