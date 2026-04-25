/**
 * Headless agent runner.
 *
 * Extracts the orchestration that used to live inside the `POST
 * /chat-agent/chat` endpoint (mode resolution, budget check, tool discovery,
 * tool filtering, system-prompt build, model resolution, `streamText` call)
 * into a single function the HTTP handler and background jobs can both call.
 *
 * Public surface: a single `runAgent(payload, opts)` named export. The plugin
 * stashes its options on `config.custom.chatAgent.pluginOptions` at config-
 * build time; `runAgent` reads them back at call time so consumers don't have
 * to wire a factory through closures.
 */

import type { ModelMessage, StreamTextResult, Tool, ToolSet, UIMessage } from 'ai'
import type { Payload, PayloadRequest, TypedUser } from 'payload'

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { getDefaultMode, validateModeAccess } from './modes.js'
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
   * Background jobs typically want `true` so the agent can read/write across
   * the whole dataset. Required to run in mode `superuser` or with `user: null`.
   */
  overrideAccess?: boolean

  /**
   * Forwarded to `buildTools` when tools need to call custom endpoints. The
   * HTTP handler passes `req`; background jobs can omit it (custom-endpoint
   * tools are skipped) or pass a real `req` if they have one. When omitted,
   * `runAgent` synthesises a minimal `req` (`{ payload, user, payloadAPI:
   * 'local', headers: new Headers() }`) and passes it to the plugin's
   * `options.tools` factory so user-defined tools that only need `req.payload`
   * keep working. Tools that genuinely need a real HTTP `req` (cookies,
   * custom-endpoint handlers, locale negotiation) are skipped on headless
   * runs and must guard their own preconditions.
   */
  req?: PayloadRequest

  /**
   * Skip the plugin's budget check/record hooks. Defaults to `false`. Set
   * `true` for service-account runs where per-user budgets don't apply.
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

  /**
   * The user context the agent acts as. Pass the logged-in user
   * (`req.user`) for interactive use, or a synthetic service-account user
   * (`{ id: 'system' }`) for background jobs. The tools inherit this user's
   * Payload access unless `overrideAccess` is set. `null` is allowed only
   * when `overrideAccess: true`.
   *
   * Accepts either Payload's `TypedUser` (so `req.user` from a real request
   * fits without a cast) or any object with an `id` (so ad-hoc
   * service-account shapes work without conjuring the full
   * `BaseUser`/`collection` machinery).
   */
  user: { id: number | string } | null | TypedUser
}

/** Result mirrors `streamText`'s handle so callers choose how to consume it. */
export type RunAgentResult = StreamTextResult<ToolSet, never>

// ---------------------------------------------------------------------------
// Public entry — looks up the plugin's stashed options
// ---------------------------------------------------------------------------

/**
 * Run the chat agent off-HTTP. Looks up the plugin options the chat-agent
 * plugin stashed on `payload.config.custom.chatAgent.pluginOptions` and
 * forwards to {@link runAgentImpl}. Throws if the plugin is not installed.
 */
export async function runAgent(payload: Payload, opts: RunAgentOptions): Promise<RunAgentResult> {
  const stash = (
    payload.config as { custom?: { chatAgent?: { pluginOptions?: ChatAgentPluginOptions } } }
  ).custom?.chatAgent?.pluginOptions
  if (!stash) {
    throw new Error(
      '@jhb.software/payload-chat-agent: runAgent is not available. ' +
        'Did you install `chatAgentPlugin()` in your Payload config?',
    )
  }
  return runAgentImpl(stash, payload, opts)
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
  payload: Payload,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  // --- Validate model factory --------------------------------------------
  if (typeof pluginOptions.model !== 'function') {
    throw new Error(
      'Chat agent plugin is misconfigured: the `model` option must be a function returning a LanguageModel.',
    )
  }

  // --- Resolve mode -------------------------------------------------------
  // We deliberately do NOT run the per-mode access function for headless
  // runs — those are HTTP gating logic, not execution logic — but we still
  // keep the structural validation (must be one of `read | ask | read-write
  // | superuser`).
  const mode: AgentMode = opts.mode ?? getDefaultMode(pluginOptions.modes ?? {})
  if (opts.mode !== undefined && opts.req) {
    // Only when a real HTTP req is provided (interactive call) do we apply
    // the user's per-mode access gate. Background jobs supply their own
    // authority via `overrideAccess`.
    const modeError = await validateModeAccess(opts.mode, pluginOptions.modes ?? {}, opts.req)
    if (modeError) {
      throw new Error(modeError)
    }
  }

  // --- Auth guard --------------------------------------------------------
  if (mode === 'superuser' && !opts.overrideAccess) {
    throw new Error('runAgent: mode "superuser" requires overrideAccess: true.')
  }
  if (opts.user === null && !opts.overrideAccess) {
    throw new Error(
      'runAgent: user: null requires overrideAccess: true (otherwise every tool call hits access checks with no subject and fails).',
    )
  }

  const overrideAccess = opts.overrideAccess ?? mode === 'superuser'

  // --- Budget check ------------------------------------------------------
  let remaining: null | number = null
  const budget = pluginOptions.budget
  if (budget && !opts.skipBudget) {
    const reqForBudget = opts.req ?? buildSyntheticReq(payload, opts.user)
    remaining = await budget.check({ req: reqForBudget })
    if (remaining !== null && remaining <= 0) {
      const err = new Error('Token budget exceeded') as { remaining?: number } & Error
      err.remaining = 0
      throw err
    }
  }
  // Track for the HTTP wrapper to read; not strictly needed at this layer
  // but kept on a side-channel for symmetry with the previous handler.
  void remaining

  // --- Discover custom endpoints + build tools ---------------------------
  // `discoverEndpoints` reads `payload.config` (not `req`) so it works the
  // same in headless and HTTP runs. `buildTools` internally gates the
  // executable `callEndpoint` tool on `req` so it's skipped on headless
  // runs; `listEndpoints` stays available as informational metadata.
  const customEndpoints = discoverEndpoints(payload.config)
  const builtInTools = buildTools(
    payload as unknown as Parameters<typeof buildTools>[0],
    opts.user,
    overrideAccess,
    opts.req,
    customEndpoints,
    payload.config,
  )
  // The system prompt's "call `listEndpoints` to see custom endpoints"
  // hint is only useful when `callEndpoint` is also wired up — otherwise
  // the agent sees endpoints it can't invoke.
  const hasCustomEndpoints = customEndpoints.length > 0 && Boolean(opts.req)

  // --- Resolve the modelId so the tools resolver sees it -----------------
  const modelId = opts.model ?? pluginOptions.defaultModel

  // --- Compose the toolset ----------------------------------------------
  const reqForToolsResolver: PayloadRequest = opts.req ?? buildSyntheticReq(payload, opts.user)

  let baseTools: Record<string, Tool>
  if (pluginOptions.tools) {
    try {
      baseTools = await pluginOptions.tools({
        defaultTools: builtInTools,
        modelId,
        req: reqForToolsResolver,
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
    payload.config,
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
            req: opts.req ?? buildSyntheticReq(payload, opts.user),
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

/**
 * Build the synthetic minimal `req` we hand to the plugin's `options.tools`
 * factory and to `budget.check` / `budget.record` when no real HTTP request
 * is in flight.
 *
 * Typed as `Pick<PayloadRequest, 'payload' | 'user' | 'payloadAPI' | 'headers'>`
 * and cast at the boundary; locale, i18n, and middleware-attached fields are
 * deliberately absent so a tool that reads them (instead of guarding) fails
 * loudly at the consumer's factory boundary rather than silently producing
 * wrong content.
 */
function buildSyntheticReq(payload: Payload, user: RunAgentOptions['user']): PayloadRequest {
  return {
    headers: new Headers(),
    payload,
    payloadAPI: 'local',
    user,
  } as unknown as PayloadRequest
}
