/**
 * Headless agent runner — the same orchestration the chat endpoint uses,
 * exposed as a `runAgent(req, opts)` function so background jobs can invoke
 * the agent off-HTTP. See the `runAgent` JSDoc below for the public contract.
 */

import type { ModelMessage, StreamTextResult, Tool, ToolSet, UIMessage } from 'ai'
import type { PayloadRequest } from 'payload'

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, BudgetConfig, ChatAgentPluginOptions } from './types.js'

import { systemMessageWithCache, withTrailingCache } from './cache-control.js'
import { debugLogPromptIfEnabled } from './debug-prompt.js'
import { getDefaultMode } from './modes.js'
import { getPluginOptions } from './plugin-custom-config.js'
import { sanitizeOrphanToolCalls } from './sanitize-tool-calls.js'
import { buildSystemPrompt } from './system-prompt.js'
import { buildTools, discoverEndpoints, filterToolsByMode } from './tools.js'

export interface RunAgentOptions {
  /** Abort signal. Interactive callers pass `req.signal`. */
  abortSignal?: AbortSignal

  /** Per-call step cap. Defaults to the plugin's `maxSteps` (default 20). */
  maxSteps?: number

  /**
   * The conversation so far. A single `string` is wrapped as one user message;
   * a `UIMessage[]` (from `useChat`) is converted via `convertToModelMessages`
   * with `ignoreIncompleteToolCalls: true`; a `ModelMessage[]` is passed
   * through verbatim.
   */
  messages: ModelMessage[] | string | UIMessage[]

  /** Which mode to run in. Defaults to the plugin's default mode. */
  mode?: AgentMode

  /** Model id. Defaults to the plugin's `defaultModel`. */
  model?: string

  /** Forwarded to the AI SDK's `streamText({ onFinish })`. */
  onFinish?: (event: {
    totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  }) => Promise<void> | void

  /**
   * Bypass Payload access control when executing tools. Required for
   * `mode: 'superuser'` and for runs without `req.user`.
   */
  overrideAccess?: boolean

  /** Skip the plugin's budget check/record hooks. */
  skipBudget?: boolean

  /**
   * Replace the derived system prompt entirely (string), or transform it
   * (function — `(base) => string`).
   */
  systemPrompt?: ((basePrompt: string) => Promise<string> | string) | string

  /**
   * Replace or compose the toolset. A function receives the toolset after the
   * plugin's `options.tools` factory has run; a static `ToolSet` replaces it
   * outright.
   */
  tools?: ((baseTools: ToolSet) => ToolSet) | ToolSet
}

/** Result mirrors `streamText`'s handle so callers choose how to consume it. */
export type RunAgentResult = StreamTextResult<ToolSet, never>

/**
 * Thrown when a consumer-supplied `tools` factory throws. Lets the HTTP
 * wrapper distinguish caller-config failures (500) from other run errors.
 */
export class ToolsResolverError extends Error {
  override name = 'ToolsResolverError'
  constructor(cause: unknown) {
    super(`tools resolver failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

/**
 * Run the chat agent off-HTTP. Reads the plugin options the chat-agent
 * plugin wrote into `req.payload.config.custom.chatAgent.pluginOptions` and
 * forwards to the internal implementation. Throws if the plugin is not installed.
 *
 * `req` carries both the actor (`req.user`) and the Local API
 * (`req.payload`). For background callers without an HTTP `req`, construct
 * one with Payload's `createLocalReq({ user }, payload)` helper.
 *
 * Per-mode access checks (`modes.access[mode]`) are NOT run here — the
 * caller is the authority for headless invocations. The HTTP wrapper
 * validates them upstream because its `mode` comes from the request body.
 */
export async function runAgent(
  req: PayloadRequest,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  const pluginOptions = getPluginOptions(req.payload)
  if (!pluginOptions) {
    throw new Error(
      '@jhb.software/payload-chat-agent: runAgent is not available. ' +
        'Did you install `chatAgentPlugin()` in your Payload config?',
    )
  }
  return runAgentImpl(pluginOptions, req, opts)
}

/**
 * @internal The actual orchestration. Pure of HTTP — returns a `streamText`
 * handle and lets the caller decide how to consume it
 * (`toUIMessageStreamResponse` for SSE, `await result.text` /
 * `result.fullStream` for jobs). Exported only for the HTTP wrapper and tests.
 */
export async function runAgentImpl(
  pluginOptions: ChatAgentPluginOptions,
  req: PayloadRequest,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  if (typeof pluginOptions.model !== 'function') {
    throw new Error(
      'Chat agent plugin is misconfigured: the `model` option must be a function returning a LanguageModel.',
    )
  }

  const mode: AgentMode = opts.mode ?? getDefaultMode(pluginOptions.modes ?? {})

  // Fail loudly if there's no actor and the caller hasn't opted in to
  // running without one — otherwise tool calls would silently hit access
  // checks with no subject.
  if (!req.user && !opts.overrideAccess) {
    throw new Error(
      'runAgent: req.user is missing. Either gate the call upstream (e.g. `if (!req.user) return Response.json({ error: "Unauthorized" }, { status: 401 })`) or pass `overrideAccess: true` to deliberately run without an actor.',
    )
  }
  if (mode === 'superuser' && !opts.overrideAccess) {
    throw new Error('runAgent: mode "superuser" requires overrideAccess: true.')
  }

  const overrideAccess = opts.overrideAccess ?? false

  const budget = pluginOptions.budget
  if (budget && !opts.skipBudget) {
    const remaining = await budget.check({ req })
    if (remaining !== null && remaining <= 0) {
      const err = new Error('Token budget exceeded') as { remaining?: number } & Error
      err.remaining = 0
      throw err
    }
  }

  const customEndpoints = discoverEndpoints(req.payload.config)
  const builtInTools = buildTools(
    req.payload as unknown as Parameters<typeof buildTools>[0],
    req.user,
    overrideAccess,
    req,
    customEndpoints,
    req.payload.config,
  )

  const modelId = opts.model ?? pluginOptions.defaultModel

  let baseTools: ToolSet
  if (pluginOptions.tools) {
    try {
      baseTools = (await pluginOptions.tools({
        defaultTools: builtInTools,
        modelId,
        req,
      })) as ToolSet
    } catch (err) {
      throw new ToolsResolverError(err)
    }
  } else {
    baseTools = builtInTools as ToolSet
  }

  let finalTools: ToolSet
  if (typeof opts.tools === 'function') {
    finalTools = opts.tools(baseTools)
  } else if (opts.tools) {
    finalTools = opts.tools
  } else {
    finalTools = baseTools
  }
  const tools = filterToolsByMode(finalTools as Record<string, Tool>, mode)

  const basePrompt = buildSystemPrompt(
    req.payload.config,
    pluginOptions.systemPrompt,
    customEndpoints.length > 0,
    mode,
  )
  let systemPrompt: string
  if (typeof opts.systemPrompt === 'string') {
    systemPrompt = opts.systemPrompt
  } else if (typeof opts.systemPrompt === 'function') {
    systemPrompt = await opts.systemPrompt(basePrompt)
  } else {
    systemPrompt = basePrompt
  }

  const resolvedModel = pluginOptions.model(modelId)
  const onFinish = composeOnFinish({
    budget: opts.skipBudget ? undefined : budget,
    callerOnFinish: opts.onFinish,
    modelId,
    req,
  })

  // `sanitizeOrphanToolCalls` is a defence-in-depth pass that drops
  // `tool_use` blocks whose `tool_result` never materialised (and the
  // inverse). Persistence round-trips and adapter-side bugs (vercel/ai#14259,
  // vercel/ai#14379) can leak orphans past the SDK's `ignoreIncompleteToolCalls`
  // filter; without this, Anthropic rejects the next request with `tool_use
  // ids were found without tool_result blocks immediately after`.
  const messages = sanitizeOrphanToolCalls(await normaliseMessages(opts.messages))

  const maxSteps = opts.maxSteps ?? pluginOptions.maxSteps ?? 20

  await debugLogPromptIfEnabled({ messages, systemPrompt, tools })

  return streamText({
    abortSignal: opts.abortSignal,
    messages,
    model: resolvedModel,
    onFinish,
    prepareStep: ({ messages: stepMessages }) => ({
      messages: withTrailingCache(stepMessages),
    }),
    stopWhen: stepCountIs(maxSteps),
    system: systemMessageWithCache(systemPrompt),
    toolChoice: 'auto',
    tools,
  }) as unknown as RunAgentResult
}

type FinishEvent = {
  totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

/**
 * Composes the plugin's `budget.record` (if any) with the caller's `onFinish`
 * (if any). Records first so the caller's hook can read fresh spend.
 */
export function composeOnFinish(args: {
  budget: BudgetConfig | undefined
  callerOnFinish: ((event: FinishEvent) => Promise<void> | void) | undefined
  modelId: string
  req: PayloadRequest
}): ((event: FinishEvent) => Promise<void>) | undefined {
  const { budget, callerOnFinish, modelId, req } = args
  const record = budget?.record
  if (!record && !callerOnFinish) {
    return undefined
  }
  return async (event) => {
    if (record) {
      await record({
        model: modelId,
        req,
        usage: {
          inputTokens: event.totalUsage?.inputTokens,
          outputTokens: event.totalUsage?.outputTokens,
          totalTokens: event.totalUsage?.totalTokens,
        },
      })
    }
    if (callerOnFinish) {
      await callerOnFinish(event)
    }
  }
}

async function normaliseMessages(
  input: ModelMessage[] | string | UIMessage[],
): Promise<ModelMessage[]> {
  if (typeof input === 'string') {
    return [{ content: input, role: 'user' } as ModelMessage]
  }
  if (!Array.isArray(input) || input.length === 0) {
    return input as ModelMessage[]
  }
  // Discriminate UIMessage (has `parts`) vs. ModelMessage (has `content`).
  const first = input[0] as { content?: unknown; parts?: unknown }
  if (Array.isArray(first.parts)) {
    return convertToModelMessages(input as UIMessage[], { ignoreIncompleteToolCalls: true })
  }
  return input as ModelMessage[]
}
