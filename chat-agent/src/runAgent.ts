/**
 * Headless agent runner — the same orchestration the chat endpoint uses,
 * exposed as a `runAgent(req, opts)` function so background jobs can invoke
 * the agent off-HTTP. See the `runAgent` JSDoc below for the public contract.
 */

import type { ModelMessage, StreamTextResult, Tool, ToolSet, UIMessage } from 'ai'
import type { PayloadRequest } from 'payload'

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { getDefaultMode } from './modes.js'
import { sanitizeOrphanToolCalls } from './sanitize-tool-calls.js'
import { buildSystemPrompt } from './system-prompt.js'
import { buildTools, discoverEndpoints, filterToolsByMode } from './tools.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public entry — looks up the plugin's stashed options
// ---------------------------------------------------------------------------

/**
 * Run the chat agent off-HTTP. Looks up the plugin options the chat-agent
 * plugin stashed on `req.payload.config.custom.chatAgent.pluginOptions` and
 * forwards to {@link runAgentImpl}. Throws if the plugin is not installed.
 *
 * `req` carries both the actor (`req.user`) and the Local API
 * (`req.payload`). For background callers without an HTTP `req`, construct
 * one with Payload's `createLocalReq({ user }, payload)` helper.
 */
export async function runAgent(
  req: PayloadRequest,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  const stash = (
    req.payload.config as { custom?: { chatAgent?: { pluginOptions?: ChatAgentPluginOptions } } }
  ).custom?.chatAgent?.pluginOptions
  if (!stash) {
    throw new Error(
      '@jhb.software/payload-chat-agent: runAgent is not available. ' +
        'Did you install `chatAgentPlugin()` in your Payload config?',
    )
  }
  return runAgentImpl(stash, req, opts)
}

// ---------------------------------------------------------------------------
// Implementation — exported for tests, not part of the public package surface.
// ---------------------------------------------------------------------------

/**
 * The actual orchestration. Pure of HTTP — returns a `streamText` handle and
 * lets the caller decide how to consume it (`toUIMessageStreamResponse` for
 * SSE, `await result.text` / `result.fullStream` for jobs).
 */
export async function runAgentImpl(
  pluginOptions: ChatAgentPluginOptions,
  req: PayloadRequest,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  // --- Validate model factory --------------------------------------------
  if (typeof pluginOptions.model !== 'function') {
    throw new Error(
      'Chat agent plugin is misconfigured: the `model` option must be a function returning a LanguageModel.',
    )
  }

  // --- Resolve mode -------------------------------------------------------
  const mode: AgentMode = opts.mode ?? getDefaultMode(pluginOptions.modes ?? {})

  // --- Auth guard --------------------------------------------------------
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

  const overrideAccess = opts.overrideAccess ?? mode === 'superuser'

  // --- Budget check ------------------------------------------------------
  const budget = pluginOptions.budget
  if (budget && !opts.skipBudget) {
    const remaining = await budget.check({ req })
    if (remaining !== null && remaining <= 0) {
      const err = new Error('Token budget exceeded') as { remaining?: number } & Error
      err.remaining = 0
      throw err
    }
  }

  // --- Discover custom endpoints + build tools ---------------------------
  const customEndpoints = discoverEndpoints(req.payload.config)
  const builtInTools = buildTools(
    req.payload as unknown as Parameters<typeof buildTools>[0],
    req.user,
    overrideAccess,
    req,
    customEndpoints,
    req.payload.config,
  )
  const hasCustomEndpoints = customEndpoints.length > 0

  // --- Resolve the modelId so the tools resolver sees it -----------------
  const modelId = opts.model ?? pluginOptions.defaultModel

  // --- Compose the toolset ----------------------------------------------
  let baseTools: Record<string, Tool>
  if (pluginOptions.tools) {
    try {
      baseTools = await pluginOptions.tools({
        defaultTools: builtInTools,
        modelId,
        req,
      })
    } catch (err) {
      throw new Error(`tools resolver failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    baseTools = builtInTools
  }

  let finalTools: Record<string, Tool>
  if (typeof opts.tools === 'function') {
    finalTools = opts.tools(baseTools as ToolSet) as Record<string, Tool>
  } else if (opts.tools) {
    finalTools = opts.tools as Record<string, Tool>
  } else {
    finalTools = baseTools
  }
  const tools = filterToolsByMode(finalTools, mode)

  // --- System prompt -----------------------------------------------------
  const basePrompt = buildSystemPrompt(
    req.payload.config,
    pluginOptions.systemPrompt,
    hasCustomEndpoints,
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

  // --- Resolve the model -------------------------------------------------
  const resolvedModel = pluginOptions.model(modelId)

  // --- Budget recording hook --------------------------------------------
  // Compose `budget.record` with any caller-supplied `onFinish` (record
  // first so the caller's hook can read fresh spend).
  const record = budget?.record
  const onFinish =
    record && !opts.skipBudget
      ? async (event: {
          totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
        }) => {
          await record({
            model: modelId,
            req,
            usage: {
              inputTokens: event.totalUsage?.inputTokens,
              outputTokens: event.totalUsage?.outputTokens,
              totalTokens: event.totalUsage?.totalTokens,
            },
          })
          if (opts.onFinish) {
            await opts.onFinish(event)
          }
        }
      : opts.onFinish

  // --- Normalise messages to ModelMessage[] -----------------------------
  // `sanitizeOrphanToolCalls` is a defence-in-depth pass that drops
  // `tool_use` blocks whose `tool_result` never materialised (and the
  // inverse). Persistence round-trips and adapter-side bugs (vercel/ai#14259,
  // vercel/ai#14379) can leak orphans past the SDK's `ignoreIncompleteToolCalls`
  // filter; without this, Anthropic rejects the next request with `tool_use
  // ids were found without tool_result blocks immediately after`.
  const messages = sanitizeOrphanToolCalls(await normaliseMessages(opts.messages))

  // --- Step cap ---------------------------------------------------------
  const maxSteps = opts.maxSteps ?? pluginOptions.maxSteps ?? 20

  // --- Hand off to streamText -------------------------------------------
  return streamText({
    abortSignal: opts.abortSignal,
    messages,
    model: resolvedModel,
    onFinish,
    stopWhen: stepCountIs(maxSteps),
    system: systemPrompt,
    toolChoice: 'auto',
    tools,
  }) as unknown as RunAgentResult
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
