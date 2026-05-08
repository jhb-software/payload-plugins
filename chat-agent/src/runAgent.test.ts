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

const baseUser = { id: 7 }

/**
 * Build a fake `Payload` instance carrying the plugin's `config.custom.chatAgent`
 * stash, then a `PayloadRequest` shim that points at it. `runAgent(req, opts)`
 * reads `req.payload.config.custom.chatAgent.pluginOptions` and `req.user`,
 * forwards `req.payload` into the tool builders, and hands `req` straight
 * through to the consumer's `options.tools({ req })` factory — the shim
 * provides exactly those fields.
 */
function makeReqWithPlugin(
  options: ChatAgentPluginOptions,
  user: { id: number | string } = baseUser,
): PayloadRequest {
  const transformed = chatAgentPlugin(options)({ collections: [], endpoints: [], globals: [] })
  const payload = {
    config: {
      collections: [],
      custom: transformed.custom,
      endpoints: [],
      globals: [],
    },
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    findByID: vi.fn(),
    findGlobal: vi.fn(),
    update: vi.fn(),
    updateGlobal: vi.fn(),
  } as unknown as Payload
  return {
    headers: new Headers(),
    payload,
    payloadAPI: 'local',
    user,
  } as unknown as PayloadRequest
}

function makeBareReq(user: { id: number | string } = baseUser): PayloadRequest {
  return {
    headers: new Headers(),
    payload: {
      config: { collections: [], custom: {}, endpoints: [], globals: [] },
    },
    payloadAPI: 'local',
    user,
  } as unknown as PayloadRequest
}

function lastStreamTextCall() {
  return vi.mocked(streamText).mock.calls[vi.mocked(streamText).mock.calls.length - 1][0]
}

// ---------------------------------------------------------------------------
// Plugin lookup
// ---------------------------------------------------------------------------

describe('runAgent plugin lookup', () => {
  it('throws a clear error when the plugin is not installed in the given Payload config', async () => {
    await expect(runAgent(makeBareReq(), { messages: 'hi' })).rejects.toThrow(/chatAgentPlugin\(\)/)
  })
})

// ---------------------------------------------------------------------------
// Auth / mode guards
// ---------------------------------------------------------------------------

describe('runAgent auth and mode guards', () => {
  it('rejects when mode is "superuser" without overrideAccess', async () => {
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { access: { superuser: () => true } },
    })

    await expect(runAgent(req, { messages: 'hi', mode: 'superuser' })).rejects.toThrow(/superuser/)
  })

  it('runs in superuser mode when overrideAccess is true', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { access: { superuser: () => true } },
    })

    await runAgent(req, { messages: 'hi', mode: 'superuser', overrideAccess: true })
    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1)
  })

  // Caller didn't gate `req.user` upstream and didn't opt in to running
  // without an actor. Every tool call would otherwise hit Payload access
  // checks with no subject and silently fail — surface the misconfiguration
  // here instead, with a message that points at the two valid fixes.
  it('rejects when req.user is missing and overrideAccess is not set', async () => {
    const req = makeReqWithPlugin(
      {
        defaultModel: 'gpt-4o-mini',
        model: makeModelFactory().factory,
      },
      undefined as unknown as { id: number | string },
    )
    ;(req as unknown as { user: unknown }).user = null

    await expect(runAgent(req, { messages: 'hi' })).rejects.toThrow(/req\.user is missing/)
  })

  it('allows req.user to be missing when overrideAccess is true (explicit opt-in)', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })
    ;(req as unknown as { user: unknown }).user = null

    await runAgent(req, { messages: 'hi', overrideAccess: true })
    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Messages normalisation
// ---------------------------------------------------------------------------

describe('runAgent messages normalisation', () => {
  it('wraps a single string prompt as one user ModelMessage', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(req, { messages: 'audit the pages' })

    const sent = lastStreamTextCall().messages as Array<{ content: unknown; role: string }>
    expect(sent).toHaveLength(1)
    expect(sent[0].role).toBe('user')
    expect(sent[0].content).toBe('audit the pages')
  })

  it('passes ModelMessage[] through verbatim', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const modelMessages = [
      { content: 'one', role: 'user' as const },
      { content: 'two', role: 'assistant' as const },
    ]
    await runAgent(req, { messages: modelMessages })

    const sent = lastStreamTextCall().messages as typeof modelMessages
    expect(sent).toEqual(modelMessages)
  })

  it('converts UIMessage[] via convertToModelMessages with ignoreIncompleteToolCalls', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const ui: UIMessage[] = [
      { id: 'u1', parts: [{ type: 'text', text: 'hello world' }], role: 'user' },
    ]
    await runAgent(req, { messages: ui })

    const sent = lastStreamTextCall().messages as Array<{ content: unknown; role: string }>
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
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
      tools: ({ defaultTools }) => ({ ...defaultTools, pluginExtra: pluginAdded }),
    })

    await runAgent(req, {
      messages: 'hi',
      tools: (base) => {
        receivedBase = base
        return { find: base.find }
      },
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
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })

    await runAgent(req, {
      messages: 'hi',
      tools: { onlyTool },
    })

    const finalTools = lastStreamTextCall().tools!
    expect(Object.keys(finalTools)).toEqual(['onlyTool'])
    expect(finalTools.onlyTool.execute).toBe(onlyTool.execute)
  })

  it('hands the caller-supplied req straight through to the plugin tools factory', async () => {
    vi.mocked(streamText).mockClear()
    let receivedReq: PayloadRequest | undefined
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      tools: ({ defaultTools, req: r }) => {
        receivedReq = r
        return defaultTools
      },
    })

    await runAgent(req, { messages: 'hi' })

    expect(receivedReq).toBe(req)
  })

  it('registers callEndpoint when the config has a discoverable custom endpoint', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
      modes: { default: 'read-write' },
    })
    ;(req.payload.config as { endpoints: unknown[] }).endpoints = [
      {
        custom: { description: 'demo' },
        handler: () => new Response('ok'),
        method: 'get',
        path: '/demo',
      },
    ]

    await runAgent(req, { messages: 'hi' })

    const finalTools = lastStreamTextCall().tools!
    expect(finalTools.callEndpoint).toBeDefined()
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
    const req = makeReqWithPlugin({
      budget: { check, record },
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(req, { messages: 'hi', skipBudget: true })

    expect(check).not.toHaveBeenCalled()
    // onFinish hook should not have been wired either.
    expect(lastStreamTextCall().onFinish).toBeUndefined()
  })

  it('runs budget.check when skipBudget is false (or omitted)', async () => {
    vi.mocked(streamText).mockClear()
    const check = vi.fn(() => 1000)
    const req = makeReqWithPlugin({
      budget: { check },
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(req, { messages: 'hi' })

    expect(check).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// systemPrompt override / extender
// ---------------------------------------------------------------------------

describe('runAgent systemPrompt option', () => {
  it('replaces the derived prompt when systemPrompt is a string', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(req, {
      messages: 'hi',
      systemPrompt: 'you are a custom audit agent',
    })

    const sent = lastStreamTextCall().system as { content: string; role: 'system' }
    expect(sent.content).toBe('you are a custom audit agent')
  })

  it('lets a function transform the derived base prompt', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    await runAgent(req, {
      messages: 'hi',
      systemPrompt: (base) => `${base}\n\nExtra instruction.`,
    })

    const sent = lastStreamTextCall().system as { content: string; role: 'system' }
    expect(sent.content.endsWith('Extra instruction.')).toBe(true)
    expect(sent.content).toContain('CMS content assistant')
  })
})

// ---------------------------------------------------------------------------
// Anthropic prompt caching
// ---------------------------------------------------------------------------

describe('runAgent prompt caching', () => {
  it('marks the system prompt with an ephemeral cache breakpoint so it is reused across requests', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'claude-haiku-4-5',
      model: makeModelFactory().factory,
    })

    await runAgent(req, { messages: 'hi' })

    const sent = lastStreamTextCall().system as {
      content: string
      providerOptions: { anthropic: { cacheControl: { type: string } } }
      role: string
    }
    expect(sent.role).toBe('system')
    expect(sent.providerOptions.anthropic.cacheControl).toEqual({ type: 'ephemeral' })
    expect(sent.content).toContain('CMS content assistant')
  })

  it('keeps a single cache breakpoint on the trailing message as multi-step accumulates messages', async () => {
    vi.mocked(streamText).mockClear()
    const req = makeReqWithPlugin({
      defaultModel: 'claude-haiku-4-5',
      model: makeModelFactory().factory,
    })

    await runAgent(req, { messages: [{ content: 'hi', role: 'user' }] })

    const prepareStep = lastStreamTextCall().prepareStep
    expect(prepareStep).toBeDefined()

    // Simulate a multi-step state — earlier user message carries a stale
    // breakpoint that should be moved onto the new tool-result tail.
    const stepMessages = [
      {
        content: 'hi',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        role: 'user' as const,
      },
      {
        content: [{ type: 'tool-call' as const, input: {}, toolCallId: 'a', toolName: 'find' }],
        role: 'assistant' as const,
      },
      {
        content: [
          {
            type: 'tool-result' as const,
            output: { type: 'json' as const, value: { ok: true } },
            toolCallId: 'a',
            toolName: 'find',
          },
        ],
        role: 'tool' as const,
      },
    ]
    const result = await prepareStep!({
      experimental_context: undefined,
      messages: stepMessages,
      model: {} as unknown as Parameters<NonNullable<typeof prepareStep>>[0]['model'],
      stepNumber: 1,
      steps: [] as unknown as Parameters<NonNullable<typeof prepareStep>>[0]['steps'],
    })

    const out = (result as { messages: typeof stepMessages }).messages
    expect(out[0].providerOptions).toBeUndefined()
    expect(out[1].providerOptions).toBeUndefined()
    expect(out[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
  })
})

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('runAgent return shape', () => {
  it('returns the raw streamText handle so callers can read text/totalUsage/fullStream', async () => {
    const req = makeReqWithPlugin({
      defaultModel: 'gpt-4o-mini',
      model: makeModelFactory().factory,
    })

    const result = await runAgent(req, { messages: 'hi' })
    // Mirrors the AI SDK's `streamText` handle — these are the fields a job
    // task handler relies on.
    expect(await result.text).toBe('OK')
    expect(await result.totalUsage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  })
})
