import type { LanguageModel, Tool } from 'ai'
import type { Endpoint } from 'payload'

import { convertToModelMessages, streamText } from 'ai'
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
//
// The mock captures the options passed to both `streamText` and
// `toUIMessageStreamResponse` on the returned object so budget tests can
// assert on `headers` / invoke the `onFinish` callback.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    // Wrapped in `vi.fn` so individual tests can override it with
    // `mockReturnValueOnce` to inject a pre-built orphan-containing
    // `ModelMessage[]` — the real conversion hides behind
    // `ignoreIncompleteToolCalls`, so there's no UIMessage shape that
    // reliably surfaces an orphan through it.
    convertToModelMessages: vi.fn(actual.convertToModelMessages),
    streamText: vi.fn((streamTextOpts: unknown) => {
      const handle = {
        _streamTextOpts: streamTextOpts,
        _uiStreamOpts: undefined as unknown,
        toUIMessageStreamResponse: (uiStreamOpts: { headers?: HeadersInit } = {}) => {
          handle._uiStreamOpts = uiStreamOpts
          return new Response('ok', { headers: uiStreamOpts.headers })
        },
      }
      return handle
    }),
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
// Tool-call sanitization before handing messages to the provider
// ---------------------------------------------------------------------------

describe('chatAgentPlugin tool-call sanitization', () => {
  // Regression: when a previous assistant turn's tool call was interrupted
  // (tab closed, network blip) the AI SDK leaves the tool part in a
  // non-terminal state with whatever `parsePartialJson` last returned as
  // `input` — often a string or `undefined`, not a dictionary. If those
  // messages are forwarded verbatim, Anthropic rejects the request with:
  //   messages.N.content.M.tool_use.input: Input should be a valid dictionary
  // and orphan `tool_use` blocks (no matching `tool_result`) surface the
  // same class of failure on other providers. The handler must drop these
  // incomplete tool calls before calling the model.
  it('drops interrupted tool calls so the provider never sees a non-dict tool_use input', async () => {
    vi.mocked(streamText).mockClear()
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () =>
        Promise.resolve({
          messages: [
            { id: 'u1', parts: [{ type: 'text', text: 'find docs about X' }], role: 'user' },
            {
              id: 'a1',
              parts: [
                {
                  type: 'tool-search',
                  input: '"part',
                  state: 'input-available',
                  toolCallId: 'call_1',
                },
              ],
              role: 'assistant',
            },
          ],
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    const sent = vi.mocked(streamText).mock.calls[0][0].messages as Array<{
      content: unknown
      role: string
    }>
    for (const msg of sent) {
      if (!Array.isArray(msg.content)) {
        continue
      }
      for (const part of msg.content as Array<{ input?: unknown; type: string }>) {
        if (part.type !== 'tool-call') {
          continue
        }
        expect(part.input).not.toBeNull()
        expect(typeof part.input).toBe('object')
        expect(Array.isArray(part.input)).toBe(false)
      }
    }
  })

  // Regression for the Anthropic-observable failure a user hit after a
  // usage-limit error interrupted a tool run and the orphan `tool_use` got
  // persisted into the conversation store. Resuming that conversation then
  // failed every request with:
  //   messages.N: `tool_use` ids were found without `tool_result` blocks
  //   immediately after: toolu_01E7pmk8d3gwFDfmdzzeLUQ1
  // `ignoreIncompleteToolCalls` doesn't catch this class of orphan
  // (it only strips `input-streaming` / `input-available` parts), so the
  // endpoint must scrub the converted `ModelMessage[]` before calling the
  // provider. The test drives the exact scenario by injecting an orphan
  // directly as the conversion output, since no clean UIMessage shape
  // survives `ignoreIncompleteToolCalls` to expose this path otherwise.
  it('strips orphan tool_use blocks from the converted messages before calling the provider', async () => {
    vi.mocked(streamText).mockClear()
    vi.mocked(convertToModelMessages).mockReturnValueOnce(
      Promise.resolve([
        { content: 'find docs about X', role: 'user' },
        {
          content: [
            { type: 'text', text: 'let me search' },
            {
              type: 'tool-call',
              input: { q: 'X' },
              toolCallId: 'toolu_01E7pmk8d3gwFDfmdzzeLUQ1',
              toolName: 'find',
            },
          ],
          role: 'assistant',
        },
        { content: 'never mind, skip it', role: 'user' },
      ]),
    )

    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () =>
        Promise.resolve({
          messages: [{ id: 'u1', parts: [{ type: 'text', text: 'skip' }], role: 'user' }],
        }),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    const sent = vi.mocked(streamText).mock.calls[0][0].messages as Array<{
      content: unknown
      role: string
    }>
    const toolCallIds: string[] = []
    for (const msg of sent) {
      if (!Array.isArray(msg.content)) {
        continue
      }
      for (const part of msg.content as Array<{ toolCallId?: string; type: string }>) {
        if (part.type === 'tool-call' && part.toolCallId) {
          toolCallIds.push(part.toolCallId)
        }
      }
    }
    expect(toolCallIds).not.toContain('toolu_01E7pmk8d3gwFDfmdzzeLUQ1')
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

  it('cancels the provider call when the client disconnects mid-stream', async () => {
    // The observable user-facing symptom of this regression is token spend
    // for a stream nobody is reading — we can't measure spend in a unit
    // test, but the AI SDK treats `abortSignal` as the one knob that makes
    // it stop mid-call. Wire the request's abort signal through and
    // confirm the SDK would see it fire: `streamText` is the stubbed
    // boundary here, so observing the `AbortSignal` it receives is the
    // closest we can get without a live provider.
    vi.mocked(streamText).mockClear()
    const controller = new AbortController()
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
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
      signal: controller.signal,
      user: { id: 1 },
    })

    const forwarded = vi.mocked(streamText).mock.calls[0][0].abortSignal
    expect(forwarded).toBeInstanceOf(AbortSignal)
    expect(forwarded!.aborted).toBe(false)
    controller.abort()
    expect(forwarded!.aborted).toBe(true)
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

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

/**
 * Finds the mocked streamText handle for the most recent chat request so a
 * test can pull `_streamTextOpts.onFinish` off it and simulate a completed
 * stream — the mock doesn't actually run the AI SDK machinery.
 */
function lastStreamTextHandle() {
  const results = vi.mocked(streamText).mock.results
  return results[results.length - 1]?.value as {
    _streamTextOpts: {
      onFinish?: (event: unknown) => Promise<void> | void
      tools?: Record<string, { execute?: unknown; needsApproval?: boolean }>
    }
    _uiStreamOpts: { headers?: Record<string, string> }
  }
}

const validChatBody = {
  messages: [{ id: '1', parts: [{ type: 'text', text: 'hi' }], role: 'user' }],
}

describe('chatAgentPlugin budget', () => {
  it('rejects a chat request with 429 when the caller is out of budget', async () => {
    const plugin = chatAgentPlugin({
      budget: { check: () => 0 },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    const res = await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/budget/i)
    expect(body.remaining).toBe(0)
  })

  it('exposes the remaining budget on the response header for client-side warnings', async () => {
    const plugin = chatAgentPlugin({
      budget: { check: () => 12_345 },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    const res = await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Budget-Remaining')).toBe('12345')
  })

  it('allows the request without emitting a budget header when check() returns null', async () => {
    // Null means "unlimited" — the feature is configured but the caller has no
    // cap. User-observable behavior: request succeeds and there's no header
    // for the client to build a warning UI against.
    const plugin = chatAgentPlugin({
      budget: { check: () => null },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    const res = await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Budget-Remaining')).toBeNull()
  })

  it('surfaces errors thrown by check() as HTTP 500', async () => {
    // Errors must surface — we do not swallow them. This is a deliberate
    // design decision so that a broken budget store fails loudly instead of
    // silently letting unlimited spend through.
    const plugin = chatAgentPlugin({
      budget: {
        check: () => {
          throw new Error('usage-store offline')
        },
      },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    const res = await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('usage-store offline')
  })

  it('records the observed token usage after a chat response completes', async () => {
    // Ordering contract: record() is awaited inside onFinish before the stream
    // closes, so a back-to-back request from the same user reads fresh usage.
    // We drive onFinish manually because the `ai` mock stops short of the real
    // streaming loop — the behaviour under test is "record sees the final
    // usage numbers and the model id that was used".
    const recorded: Array<{ model: string; totalTokens?: number; userId?: number }> = []
    const plugin = chatAgentPlugin({
      budget: {
        check: () => 1000,
        record: ({ model, req, usage }) => {
          recorded.push({
            model,
            totalTokens: usage.totalTokens,
            userId: (req.user as { id: number } | null)?.id,
          })
        },
      },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 7 },
    })

    const { _streamTextOpts } = lastStreamTextHandle()
    await _streamTextOpts.onFinish!({
      totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    })

    expect(recorded).toEqual([{ model: 'claude-sonnet-4-20250514', totalTokens: 30, userId: 7 }])
  })

  it('surfaces errors thrown by record() — does not swallow them', async () => {
    const record = vi.fn(() => {
      throw new Error('db write failed')
    })
    const plugin = chatAgentPlugin({
      budget: { check: () => 1000, record },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler
    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })
    const { _streamTextOpts } = lastStreamTextHandle()

    await expect(_streamTextOpts.onFinish!({ totalUsage: {} })).rejects.toThrow('db write failed')
  })
})

// ---------------------------------------------------------------------------
// GET /chat-agent/budget
// ---------------------------------------------------------------------------

describe('chatAgentPlugin GET /chat-agent/budget', () => {
  it('is not registered when no budget is configured', () => {
    const plugin = chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/budget')
    expect(ep).toBeUndefined()
  })

  it('returns the current remaining budget when configured', async () => {
    const plugin = chatAgentPlugin({
      budget: { check: () => 42 },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const result = plugin({ endpoints: [] })
    const ep = result.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/budget')
    expect(ep).toBeDefined()
    const res = await ep.handler({ user: { id: 1 } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ remaining: 42 })
  })

  it('returns 401 when plugin access() denies', async () => {
    const plugin = chatAgentPlugin({
      access: () => false,
      budget: { check: () => 42 },
      defaultModel: 'claude-sonnet-4-20250514',
      model: makeModelFactory().factory,
    })
    const config = plugin({ endpoints: [] })
    const ep = config.endpoints.find((ep: Endpoint) => ep.path === '/chat-agent/budget')
    const res = await ep.handler({
      payload: { config: { custom: config.custom } },
      user: { id: 1 },
    })
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// `tools` composition API
// ---------------------------------------------------------------------------

describe('chatAgentPlugin tools', () => {
  /**
   * Minimal fake Vercel AI SDK `Tool`. The handler only inspects the shape
   * (keys, `needsApproval`, `execute`) to decide how to register and filter
   * the tool, so we don't need real zod schemas here — the cast via
   * `unknown` is the deliberate test-boundary bridge to the SDK's deep Tool
   * type.
   */
  function fakeTool(overrides: Record<string, unknown> = {}): Tool {
    return {
      description: 'fake tool',
      execute: vi.fn(() => Promise.resolve({ ok: true })),
      inputSchema: { _def: { typeName: 'ZodObject' } },
      ...overrides,
    } as unknown as Tool
  }

  /**
   * Stand-in for a provider-defined tool like
   * `anthropic.tools.webSearch_20250305(...)`. The real object has
   * `type: 'provider'` and no `execute` — the provider runs the tool
   * server-side — so we mirror that shape here.
   */
  function fakeProviderTool(id: `${string}.${string}`): Tool {
    return {
      id,
      type: 'provider',
      args: {},
      inputSchema: { _def: { typeName: 'ZodObject' } },
    } as unknown as Tool
  }

  it('makes user-registered tools callable by the agent', async () => {
    vi.mocked(streamText).mockClear()
    const salesTool = fakeTool({ description: 'Create a lead in the Sales API' })
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: ({ defaultTools }) => ({ ...defaultTools, createSalesLead: salesTool }),
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    const { _streamTextOpts } = lastStreamTextHandle()
    expect(_streamTextOpts.tools!.createSalesLead).toBeDefined()
    expect(_streamTextOpts.tools!.createSalesLead.execute).toBe(salesTool.execute)
  })

  it('passes the built-in default tools into the factory so the user can compose them', async () => {
    vi.mocked(streamText).mockClear()
    let receivedDefaults: Record<string, Tool> | undefined
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: ({ defaultTools }) => {
        receivedDefaults = defaultTools
        return { ...defaultTools, extra: fakeTool() }
      },
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    expect(receivedDefaults).toBeDefined()
    expect(receivedDefaults!.find).toBeDefined()
    expect(receivedDefaults!.create).toBeDefined()
    const { _streamTextOpts } = lastStreamTextHandle()
    expect(_streamTextOpts.tools!.find).toBeDefined()
    expect(_streamTextOpts.tools!.extra).toBeDefined()
  })

  it('lets the user omit a default tool by not including it in the returned map', async () => {
    vi.mocked(streamText).mockClear()
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: ({ defaultTools }) => {
        const { delete: _, ...rest } = defaultTools
        return rest
      },
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    const { _streamTextOpts } = lastStreamTextHandle()
    expect(_streamTextOpts.tools!.delete).toBeUndefined()
    expect(_streamTextOpts.tools!.find).toBeDefined()
  })

  it('exposes the built-in default tools to the agent when `tools` is not provided', async () => {
    vi.mocked(streamText).mockClear()
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: { id: 1 },
    })

    const { _streamTextOpts } = lastStreamTextHandle()
    expect(_streamTextOpts.tools!.find).toBeDefined()
    expect(_streamTextOpts.tools!.create).toBeDefined()
  })

  it('awaits async tools resolvers and passes the request to them', async () => {
    vi.mocked(streamText).mockClear()
    const receivedArgs: Array<{ req: unknown }> = []
    const plugin = chatAgentPlugin({
      defaultModel: 'gpt-4o',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: (args) => {
        receivedArgs.push(args)
        return Promise.resolve({ ...args.defaultTools, fetchWeather: fakeTool() })
      },
    })
    const handler = plugin({ endpoints: [] }).endpoints.find(
      (ep: Endpoint) => ep.path === '/chat-agent/chat',
    ).handler

    const fakeUser = { id: 7, email: 'user@test.com' }
    await handler({
      json: () => Promise.resolve(validChatBody),
      payload: { config: { collections: [], globals: [] } },
      user: fakeUser,
    })

    expect(receivedArgs).toHaveLength(1)
    expect((receivedArgs[0].req as { user: unknown }).user).toBe(fakeUser)
    const { _streamTextOpts } = lastStreamTextHandle()
    expect(_streamTextOpts.tools!.fetchWeather).toBeDefined()
  })

  describe('mode filtering for user-defined tools', () => {
    // The plugin can't know a user tool's side effects, so a tool with an
    // `execute` function defaults to "write": excluded in read, gated behind
    // needsApproval in ask. Provider-native tools (no `execute`) are treated
    // as reads since the provider runs them server-side.

    async function runChatWithMode(
      mode: 'ask' | 'read' | 'read-write',
      extra: Record<string, Tool>,
    ) {
      vi.mocked(streamText).mockClear()
      const plugin = chatAgentPlugin({
        defaultModel: 'gpt-4o',
        model: makeModelFactory().factory,
        modes: { default: mode },
        tools: ({ defaultTools }) => ({ ...defaultTools, ...extra }),
      })
      const handler = plugin({ endpoints: [] }).endpoints.find(
        (ep: Endpoint) => ep.path === '/chat-agent/chat',
      ).handler
      await handler({
        json: () => Promise.resolve(validChatBody),
        payload: { config: { collections: [], globals: [] } },
        user: { id: 1 },
      })
      return lastStreamTextHandle()._streamTextOpts.tools
    }

    it('excludes user-defined executable tools in read mode', async () => {
      const tools = await runChatWithMode('read', { createSalesLead: fakeTool() })
      expect(tools!.createSalesLead).toBeUndefined()
    })

    it('marks user-defined executable tools with needsApproval: true in ask mode', async () => {
      const tools = await runChatWithMode('ask', { createSalesLead: fakeTool() })
      expect(tools!.createSalesLead).toBeDefined()
      expect(tools!.createSalesLead.needsApproval).toBe(true)
    })

    it('passes user-defined executable tools through unchanged in read-write mode', async () => {
      const tools = await runChatWithMode('read-write', { createSalesLead: fakeTool() })
      expect(tools!.createSalesLead).toBeDefined()
      expect(tools!.createSalesLead.needsApproval).toBeUndefined()
    })

    it('keeps provider-native tools available in read mode', async () => {
      const tools = await runChatWithMode('read', {
        webSearch: fakeProviderTool('anthropic.web_search_20250305'),
      })
      expect(tools!.webSearch).toBeDefined()
    })

    it('does not mark provider-native tools with needsApproval in ask mode', async () => {
      // They're server-executed by the provider — the client can't approve
      // something the provider already ran. Leave the object untouched so
      // `filterToolsByMode` doesn't invent an approval gate it can't enforce.
      const tools = await runChatWithMode('ask', {
        webSearch: fakeProviderTool('anthropic.web_search_20250305'),
      })
      expect(tools!.webSearch).toBeDefined()
      expect((tools!.webSearch as { needsApproval?: boolean }).needsApproval).toBeUndefined()
    })
  })
})
