import type { LanguageModel, Tool, UIMessage } from 'ai'
import type { Payload, PayloadRequest } from 'payload'

import { streamText } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import type { ChatAgentPluginOptions } from './types.js'

import { chatAgentPlugin } from './index.js'
import { runAgent } from './runAgent.js'

// Mock the `ai` module so the runner doesn't actually try to talk to a
// provider. We keep every other export real (`convertToModelMessages`,
// `stepCountIs`, …) and only swap `streamText` for a vi.fn whose return value
// satisfies `result.text` / `result.totalUsage` reads in tests.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn((streamTextOpts: unknown) => {
      const handle = {
        _streamTextOpts: streamTextOpts,
        text: Promise.resolve('OK'),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
        toUIMessageStreamResponse: (uiStreamOpts: { headers?: HeadersInit } = {}) =>
          new Response('ok', { headers: uiStreamOpts.headers }),
      }
      return handle
    }),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModelFactory() {
  const calls: string[] = []
  const factory = vi.fn((id: string): LanguageModel => {
    calls.push(id)
    return { id, __fake: true } as unknown as LanguageModel
  })
  return { calls, factory }
}

/**
 * Build a fake `Payload` instance carrying the plugin's `config.custom.chatAgent`
 * stash, so `runAgent(payload, ...)` can pick the options up the same way it
 * would in production.
 *
 * The `payload` value is intentionally narrow — `runAgent` only reads `config`
 * and forwards the instance to tool builders, which we mock by supplying our
 * own `find/create/...` no-op implementations.
 */
function makePayloadWithPlugin(options: ChatAgentPluginOptions): Payload {
  const transformed = chatAgentPlugin(options)({ collections: [], endpoints: [], globals: [] })
  return {
    config: {
      collections: [],
      custom: transformed.custom,
      endpoints: [],
      globals: [],
    },
    // Local API stubs so tools that close over them don't crash if executed.
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    findByID: vi.fn(),
    findGlobal: vi.fn(),
    update: vi.fn(),
    updateGlobal: vi.fn(),
  } as unknown as Payload
}

function makeBarePayload(): Payload {
  return {
    config: { collections: [], custom: {}, endpoints: [], globals: [] },
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    findByID: vi.fn(),
    findGlobal: vi.fn(),
    update: vi.fn(),
    updateGlobal: vi.fn(),
  } as unknown as Payload
}

function lastStreamTextCall() {
  return vi.mocked(streamText).mock.calls[vi.mocked(streamText).mock.calls.length - 1][0]
}

const baseUser = { id: 7 }

// ---------------------------------------------------------------------------
// Plugin lookup
// ---------------------------------------------------------------------------

describe('runAgent plugin lookup', () => {
  it('throws a clear error when the plugin is not installed in the given Payload config', async () => {
    await expect(runAgent(makeBarePayload(), { messages: 'hi', user: baseUser })).rejects.toThrow(
      /chatAgentPlugin\(\)/,
    )
  })
})

// ---------------------------------------------------------------------------
// Auth / mode guards
// ---------------------------------------------------------------------------

describe('runAgent auth and mode guards', () => {
  it('rejects when user is null and overrideAccess is false', async () => {
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await expect(runAgent(payload, { messages: 'hi', user: null })).rejects.toThrow(
      /overrideAccess/,
    )
  })

  it('rejects when mode is "superuser" without overrideAccess', async () => {
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { access: { superuser: () => true } },
    })

    await expect(
      runAgent(payload, { messages: 'hi', mode: 'superuser', user: baseUser }),
    ).rejects.toThrow(/superuser/)
  })

  it('allows user: null when overrideAccess is true', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, { messages: 'hi', overrideAccess: true, user: null })
    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Messages normalisation
// ---------------------------------------------------------------------------

describe('runAgent messages normalisation', () => {
  it('wraps a single string prompt as one user ModelMessage', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, { messages: 'audit the pages', user: baseUser })

    const sent = lastStreamTextCall().messages as Array<{ content: unknown; role: string }>
    expect(sent).toHaveLength(1)
    expect(sent[0].role).toBe('user')
    expect(sent[0].content).toBe('audit the pages')
  })

  it('passes ModelMessage[] through verbatim', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const modelMessages = [
      { content: 'one', role: 'user' as const },
      { content: 'two', role: 'assistant' as const },
    ]
    await runAgent(payload, { messages: modelMessages, user: baseUser })

    const sent = lastStreamTextCall().messages as typeof modelMessages
    expect(sent).toEqual(modelMessages)
  })

  it('converts UIMessage[] via convertToModelMessages with ignoreIncompleteToolCalls', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const ui: UIMessage[] = [
      { id: 'u1', parts: [{ type: 'text', text: 'hello world' }], role: 'user' },
    ]
    await runAgent(payload, { messages: ui, user: baseUser })

    const sent = lastStreamTextCall().messages as Array<{ content: unknown; role: string }>
    // convertToModelMessages collapses parts back into a content array — it
    // shouldn't be the raw UIMessage parts shape.
    expect(sent).toHaveLength(1)
    expect(sent[0].role).toBe('user')
    // The exact content shape is the AI SDK's responsibility; assert it
    // contains the user text either as a string or inside a content part.
    const serialised = JSON.stringify(sent[0].content)
    expect(serialised).toContain('hello world')
  })
})

// ---------------------------------------------------------------------------
// Tool composition
// ---------------------------------------------------------------------------

function fakeTool(overrides: Record<string, unknown> = {}): Tool {
  return {
    description: 'fake tool',
    execute: vi.fn(() => Promise.resolve({ ok: true })),
    inputSchema: { _def: { typeName: 'ZodObject' } },
    ...overrides,
  } as unknown as Tool
}

describe('runAgent tool composition', () => {
  it('passes the plugin-resolved base into the per-call factory (not the raw defaults)', async () => {
    vi.mocked(streamText).mockClear()
    const pluginAdded = fakeTool()
    let receivedBase: Record<string, Tool> | undefined
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: ({ defaultTools }) => ({ ...defaultTools, pluginExtra: pluginAdded }),
    })

    await runAgent(payload, {
      messages: 'hi',
      tools: (base) => {
        receivedBase = base
        return { find: base.find }
      },
      user: baseUser,
    })

    expect(receivedBase).toBeDefined()
    expect(receivedBase!.pluginExtra).toBe(pluginAdded)
    expect(receivedBase!.find).toBeDefined()
    const finalTools = lastStreamTextCall().tools!
    expect(Object.keys(finalTools)).toEqual(['find'])
  })

  it('replaces the base toolset entirely when `tools` is a static ToolSet', async () => {
    vi.mocked(streamText).mockClear()
    const onlyTool = fakeTool()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })

    await runAgent(payload, {
      messages: 'hi',
      tools: { onlyTool },
      user: baseUser,
    })

    const finalTools = lastStreamTextCall().tools!
    expect(Object.keys(finalTools)).toEqual(['onlyTool'])
    expect(finalTools.onlyTool.execute).toBe(onlyTool.execute)
  })
})

// ---------------------------------------------------------------------------
// Synthetic req shim
// ---------------------------------------------------------------------------

describe('runAgent synthetic req shim', () => {
  it('passes a minimal synthetic req (`{ payload, user, payloadAPI: "local", headers }`) to options.tools when no req is provided', async () => {
    vi.mocked(streamText).mockClear()
    let receivedReq: PayloadRequest | undefined
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      tools: ({ defaultTools, req }) => {
        receivedReq = req
        return defaultTools
      },
    })

    await runAgent(payload, { messages: 'hi', user: baseUser })

    expect(receivedReq).toBeDefined()
    expect(receivedReq!.payload).toBe(payload)
    expect(receivedReq!.user).toBe(baseUser)
    expect((receivedReq as unknown as { payloadAPI: string }).payloadAPI).toBe('local')
    expect(receivedReq!.headers).toBeInstanceOf(Headers)
  })

  it('omits custom-endpoint tools (callEndpoint) from the final toolset when req is absent', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })
    // Inject a discoverable custom endpoint so `discoverEndpoints` would
    // return one, then run without `req` — `callEndpoint` must not appear.
    ;(payload.config as { endpoints: unknown[] }).endpoints = [
      {
        custom: { description: 'demo' },
        handler: () => new Response('ok'),
        method: 'get',
        path: '/demo',
      },
    ]

    await runAgent(payload, { messages: 'hi', user: baseUser })

    const finalTools = lastStreamTextCall().tools!
    expect(finalTools.callEndpoint).toBeUndefined()
    // listEndpoints is OK to keep — it doesn't need req.
    expect(finalTools.listEndpoints).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Budget skipping
// ---------------------------------------------------------------------------

describe('runAgent skipBudget', () => {
  it('does not call budget.check when skipBudget is true', async () => {
    vi.mocked(streamText).mockClear()
    const check = vi.fn(() => 1000)
    const record = vi.fn()
    const payload = makePayloadWithPlugin({
      budget: { check, record },
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, { messages: 'hi', skipBudget: true, user: baseUser })

    expect(check).not.toHaveBeenCalled()
    // Onfinish hook should not have been wired either.
    expect(lastStreamTextCall().onFinish).toBeUndefined()
  })

  it('runs budget.check when skipBudget is false (or omitted)', async () => {
    vi.mocked(streamText).mockClear()
    const check = vi.fn(() => 1000)
    const payload = makePayloadWithPlugin({
      budget: { check },
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, { messages: 'hi', user: baseUser })

    expect(check).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// systemPrompt override / extender
// ---------------------------------------------------------------------------

describe('runAgent systemPrompt option', () => {
  it('replaces the derived prompt when systemPrompt is a string', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, {
      messages: 'hi',
      systemPrompt: 'you are a custom audit agent',
      user: baseUser,
    })

    expect(lastStreamTextCall().system).toBe('you are a custom audit agent')
  })

  it('lets a function transform the derived base prompt', async () => {
    vi.mocked(streamText).mockClear()
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(payload, {
      messages: 'hi',
      systemPrompt: (base) => `${base}\n\nExtra instruction.`,
      user: baseUser,
    })

    const sent = lastStreamTextCall().system as string
    expect(sent.endsWith('Extra instruction.')).toBe(true)
    expect(sent).toContain('CMS content assistant')
  })
})

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('runAgent return shape', () => {
  it('returns the raw streamText handle so callers can read text/totalUsage/fullStream', async () => {
    const payload = makePayloadWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const result = await runAgent(payload, { messages: 'hi', user: baseUser })
    // Mirrors the AI SDK's `streamText` handle — these are the fields plan
    // 015's task handler relies on.
    expect(await result.text).toBe('OK')
    expect(await result.totalUsage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  })
})
