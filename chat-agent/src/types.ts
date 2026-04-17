/**
 * Shared types for the chat agent plugin.
 */

import type { LanguageModel, Tool } from 'ai'
import type { PayloadRequest } from 'payload'

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

export interface ModelOption {
  /** Model identifier passed to the model factory. */
  id: string
  /** Human-readable label shown in the model selector UI. */
  label: string
}

/**
 * Resolves a model id to a `LanguageModel` instance from the Vercel AI SDK.
 *
 * The plugin is provider-agnostic: install whichever `@ai-sdk/*` package you
 * want (e.g. `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) and
 * return the model instance from this factory.
 *
 * @example
 * ```ts
 * import { createOpenAI } from '@ai-sdk/openai'
 * const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
 * chatAgentPlugin({
 *   defaultModel: 'gpt-4o-mini',
 *   model: (id) => openai(id),
 * })
 * ```
 *
 * @example Mixing providers
 * ```ts
 * import { createAnthropic } from '@ai-sdk/anthropic'
 * import { createOpenAI } from '@ai-sdk/openai'
 * const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
 * const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
 * chatAgentPlugin({
 *   defaultModel: 'claude-sonnet-4-20250514',
 *   availableModels: [
 *     { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet' },
 *     { id: 'gpt-4o', label: 'GPT-4o' },
 *   ],
 *   model: (id) => (id.startsWith('claude-') ? anthropic(id) : openai(id)),
 * })
 * ```
 */
export type ModelFactory = (modelId: string) => LanguageModel

// ---------------------------------------------------------------------------
// Agent modes
// ---------------------------------------------------------------------------

export const AGENT_MODES = ['read', 'ask', 'read-write', 'superuser'] as const
export type AgentMode = (typeof AGENT_MODES)[number]

export interface ModesConfig {
  /**
   * Per-mode access functions that determine availability per user.
   * - If a mode has no access function, it is available to all authenticated users.
   * - If an access function returns false, the mode is hidden from that user.
   * - `read` should never be restricted (always available regardless).
   * - `superuser` requires an explicit access function to be enabled.
   */
  access?: Partial<Record<AgentMode, (args: { req: PayloadRequest }) => boolean | Promise<boolean>>>
  /** The mode the agent starts in. Default: `'ask'` */
  default?: AgentMode
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * Token usage reported after a chat completion.
 */
export interface BudgetUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

/**
 * Small, flexible primitive for limiting how many tokens users can spend.
 *
 * The plugin itself stores nothing — `check` decides if the next request is
 * allowed and `record` stores the observed usage. Between them, you can
 * implement per-user, per-day, global, or any other budget scope without the
 * plugin needing to know which one.
 *
 * @example Per-user monthly budget
 * ```ts
 * budget: {
 *   check: async ({ req }) => 1_000_000 - await getMonthlyUsage(req.user!.id),
 *   record: ({ req, usage }) => addMonthlyUsage(req.user!.id, usage.totalTokens ?? 0),
 * }
 * ```
 *
 * @example Reuse the bundled per-user-per-day helper
 * ```ts
 * const { budget, collection } = createPayloadBudget({
 *   limit: 50_000,
 *   period: 'daily',
 *   scope: 'user',
 * })
 * ```
 */
export interface BudgetConfig {
  /**
   * Called before each chat request. Return the remaining number of tokens in
   * the current window.
   * - A positive number allows the request; the value is echoed on the response
   *   as the `X-Budget-Remaining` header so the client can warn users.
   * - `0` or a negative number rejects the request with HTTP 429.
   * - `null` skips the budget check entirely (unlimited).
   *
   * If this function throws, the request fails with HTTP 500 and the error is
   * surfaced — the plugin does not swallow it.
   */
  check: (args: { req: PayloadRequest }) => null | number | Promise<null | number>

  /**
   * Called after a chat response has streamed to completion with the actual
   * token usage. This call is awaited before the stream closes so the next
   * `check` for the same user reflects the spend.
   *
   * If this function throws, the error is surfaced — the plugin does not
   * swallow it. Typically this means the client sees a stream error on the
   * otherwise-successful response; log and handle accordingly in your
   * implementation.
   */
  record?: (args: {
    model: string
    req: PayloadRequest
    usage: BudgetUsage
  }) => Promise<void> | void
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface ChatAgentPluginOptions {
  /**
   * Gates every plugin surface (endpoints, admin view, nav link). Return `true` to allow, `false` to deny.
   *
   * When omitted, any authenticated Payload user is allowed. Set this to
   * restrict to specific roles, e.g. `({ user }) => user?.role === 'admin'`.
   *
   * For finer-grained control over which agent modes each user can use
   * (read / ask / read-write / superuser), see `modes.access`.
   */
  access?: (req: PayloadRequest) => boolean | Promise<boolean>
  /**
   * Admin panel chat view configuration. The chat view is always registered;
   * use these fields to customize the route path or replace the component.
   */
  adminView?: {
    /** Custom component path for Payload's importMap. */
    Component?: string
    /** Admin route path. Default: "/chat" */
    path?: `/${string}`
  }
  /** Models the user can choose from in the chat UI. When provided with 2+ entries, a selector dropdown is shown. */
  availableModels?: ModelOption[]
  /**
   * Optional token budget. Limits how many tokens the agent can consume per
   * user, per day, globally, or any custom window — the shape is user-defined.
   * See `BudgetConfig` for the two-function primitive and `createPayloadBudget`
   * for a ready-made helper that persists usage to a Payload collection.
   */
  budget?: BudgetConfig
  /** Model id used when no per-request override is provided. Passed to `model(id)`. */
  defaultModel: string
  /** Maximum tool-use loop steps per request. Default: 20 */
  maxSteps?: number
  /**
   * Resolves a model id to a `LanguageModel` instance.
   *
   * Called once per request with the selected model id. Use this to plug in
   * any provider supported by the Vercel AI SDK — Anthropic, OpenAI, Google,
   * Mistral, Bedrock, etc. The plugin itself depends on no provider package.
   */
  model: ModelFactory
  /**
   * Agent modes configuration. Controls which operations the agent can
   * attempt and which users can use which access levels.
   */
  modes?: ModesConfig
  /**
   * Show a "Chat" link at the top of the admin nav sidebar.
   * Set to `false` to hide it. Default: `true`.
   */
  navLink?: boolean
  /** Suggested prompts shown as clickable chips in the empty chat state. */
  suggestedPrompts?: string[]
  /** Custom text prepended to the auto-generated system prompt. */
  systemPrompt?: string
  /**
   * Customize the tools exposed to the agent. Called once per chat request
   * with the authenticated request and the plugin's default tools (Payload
   * Local API: `find`, `create`, `getCollectionSchema`, ...). Return the
   * final `name -> Tool` map — the plugin does not merge; what you return is
   * what the agent sees.
   *
   * Modelled on Payload's `lexicalEditor({ features: ({ defaultFeatures }) => ... })`:
   * spread `defaultTools` to keep them, omit/filter to drop, and add your
   * own (user-defined or provider-native) under any name.
   *
   * Tool classification for mode filtering (read / ask):
   * - Provider-native tools (no `execute` — executed server-side by the
   *   provider, e.g. `anthropic.tools.webSearch_*`) are treated as reads.
   * - Everything else with an `execute` function is treated as a write:
   *   excluded in `read`, gated behind `needsApproval` in `ask`.
   *
   * @example
   * ```ts
   * import { anthropic } from '@ai-sdk/anthropic'
   * chatAgentPlugin({
   *   tools: ({ req, defaultTools }) => ({
   *     ...defaultTools,
   *     webSearch: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
   *     queryAxiomLogs: myAxiomTool(req),
   *   }),
   * })
   * ```
   */
  tools?: (args: {
    defaultTools: Record<string, Tool>
    req: PayloadRequest
  }) => Promise<Record<string, Tool>> | Record<string, Tool>
}

// ---------------------------------------------------------------------------
// Message metadata (attached to SSE stream, read by useChat on client)
// ---------------------------------------------------------------------------

export const messageMetadataSchema = z.object({
  inputTokens: z.number().optional(),
  model: z.string().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
})

export type MessageMetadata = z.infer<typeof messageMetadataSchema>
