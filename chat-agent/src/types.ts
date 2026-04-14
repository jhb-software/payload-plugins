/**
 * Shared types for the chat agent plugin.
 */

import type { LanguageModel } from 'ai'
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
