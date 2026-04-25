/**
 * Headless agent runner.
 *
 * Extracts the orchestration that used to live inside the `POST
 * /chat-agent/chat` endpoint (mode resolution, budget check, tool discovery,
 * tool filtering, system-prompt build, model resolution, `streamText` call)
 * into a single function the HTTP handler and background jobs can both call.
 *
 * Public surface: a single `runAgent(req, opts)` named export. The plugin
 * stashes its options on `req.payload.config.custom.chatAgent.pluginOptions`
 * at config-build time; `runAgent` reads them back at call time so consumers
 * don't have to wire a factory through closures.
 *
 * `req` is required. Background callers that don't have one (a Payload task
 * handler, a webhook, a script) should construct one with Payload's
 * `createLocalReq({ user }, payload)` helper. Requiring `req` keeps the
 * runner's contract simple — `req.user` is the actor, `req.payload` is the
 * Local API, and the plugin's `options.tools({ req })` factory always
 * receives a real request rather than a stitched-together shim.
 */

import type { ModelMessage, StreamTextResult, Tool, ToolSet, UIMessage } from 'ai'
import type { PayloadRequest } from 'payload'

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { getDefaultMode } from './modes.js'
import { buildSystemPrompt } from './system-prompt.js'
import { buildTools, discoverEndpoints, filterToolsByMode } from './tools.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
  /**
   * Abort signal. Interactive callers pass `req.signal`; jobs may pass their
   * own controller (recommended for any run that might exceed the host's
   * idle timeout) or rely on `maxSteps` to terminate.
   */
  abortSignal?: AbortSignal

  /**
   * Per-call step cap. Defaults to the plugin's `maxSteps` (which itself
   * defaults to 20). Background jobs generally want a tighter bound than
   * interactive chat.
   */
  maxSteps?: number

  /**
   * The conversation so far. Accepts the same `UIMessage[]` shape the chat
   * endpoint takes (from the AI SDK `useChat`), a provider-ready
   * `ModelMessage[]`, or a single string prompt for the common one-shot case.
   *
   * Discrimination is structural: strings by `typeof`; otherwise an array of
   * `UIMessage` (with `parts`) is converted via
   * `convertToModelMessages(..., { ignoreIncompleteToolCalls: true })`; an
   * array of `ModelMessage` (with `content`) is passed through verbatim.
   */
  messages: ModelMessage[] | string | UIMessage[]

  /** Which mode to run in. Defaults to the plugin's default mode. */
  mode?: AgentMode

  /** Model id. Defaults to the plugin's `defaultModel`. */
  model?: string

  /**
   * Hook run after the underlying `streamText` call finishes (passed through
   * to the AI SDK's `onFinish`). Headless callers usually prefer reading
   * `await result.totalUsage` instead; this is here so the HTTP wrapper can
   * inject its own budget-recording callback that composes with whatever the
   * plugin's budget config wires up.
   */
  onFinish?: (event: {
    totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  }) => Promise<void> | void

  /**
   * Bypass Payload access control when executing tools. Defaults to `false`.
   * Background jobs that need to read or write across the whole dataset can
   * opt in with `overrideAccess: true`. Required to run in mode `superuser`.
   */
  overrideAccess?: boolean

  /**
   * Skip the plugin's budget check/record hooks. Defaults to `false`. Set
   * `true` for service-account / scheduled runs where per-user budgets don't
   * apply.
   */
  skipBudget?: boolean

  /**
   * Replace the derived system prompt entirely (string), or extend it (function).
   * The function form may be sync or async — async lets jobs fetch
   * task-specific context (config doc, last-week's report) before composing
   * the final prompt.
   */
  systemPrompt?: ((basePrompt: string) => Promise<string> | string) | string

  /**
   * Filter or replace the tool set. `(base) => ToolSet` lets jobs run a
   * narrow slice (e.g. read-only) without touching plugin config — `base` is
   * the toolset after the plugin's `options.tools` factory has run. A static
   * `ToolSet` replaces the base outright; pass the function form to compose.
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
  // The runner needs an actor or an explicit "I know what I'm doing" flag.
  // Without either, every Local-API tool call would hit Payload's access
  // checks with no subject and silently return empty results / access
  // errors — confusing the agent and the operator. Fail loudly here so
  // the caller either guards `if (!req.user)` upstream (the recommended
  // pattern for cron/webhook endpoints) or opts in to unauthenticated
  // runs explicitly.
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
  let remaining: null | number = null
  const budget = pluginOptions.budget
  if (budget && !opts.skipBudget) {
    remaining = await budget.check({ req })
    if (remaining !== null && remaining <= 0) {
      const err = new Error('Token budget exceeded') as { remaining?: number } & Error
      err.remaining = 0
      throw err
    }
  }
  // Side-channel for the HTTP wrapper to read; otherwise unused at this layer.
  void remaining

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
  // Compose the plugin's `budget.record` (when enabled) with any
  // caller-supplied `onFinish` so both fire — the budget hook always runs
  // first so the recorded spend is visible to a caller that might want to
  // double-check it inside its own `onFinish`.
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
  const messages = await normaliseMessages(opts.messages)

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
