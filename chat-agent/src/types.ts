/**
 * Shared types for the chat agent plugin.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

export interface ModelOption {
  /** Model identifier passed to the Anthropic API. */
  id: string
  /** Human-readable label shown in the model selector UI. */
  label: string
}

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
  access?: Partial<Record<AgentMode, (args: { req: any }) => boolean | Promise<boolean>>>
  /** The mode the agent starts in. Default: `'ask'` */
  default?: AgentMode
}

// ---------------------------------------------------------------------------
// Token budget configuration
// ---------------------------------------------------------------------------

export interface TokenBudgetConfig {
  /** Default token cap per period. */
  limit: number
  /** Whether the limit applies per user or globally. Default: 'user' */
  limitBy?: 'global' | 'user'
  /** Budget reset interval. Default: 'monthly' */
  period?: 'daily' | 'monthly'
  /**
   * Optional per-user limit override.
   * Receives the Payload request and returns a custom limit for specific
   * users, or `undefined` to use the default. May return a Promise.
   */
  resolveLimit?: (req: any) => number | Promise<number | undefined> | undefined
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface ChatAgentPluginOptions {
  /** Override the default auth check (must return true to allow). */
  access?: (req: any) => boolean | Promise<boolean>
  /**
   * Admin panel chat view configuration.
   * - Omit or `{}` to auto-register at `/admin/chat` (default).
   * - `false` to disable the admin view entirely.
   * - `{ path, Component }` to customize the route or component.
   */
  adminView?:
    | {
        /** Custom component path for Payload's importMap. */
        Component?: string
        /** Admin route path. Default: "/chat" */
        path?: `/${string}`
      }
    | false
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string
  /** Models the user can choose from in the chat UI. When provided with 2+ entries, a selector dropdown is shown. */
  availableModels?: ModelOption[]
  /** Claude model ID used when no per-request override is provided. */
  defaultModel: string
  /** Maximum tool-use loop steps per request. Default: 20 */
  maxSteps?: number
  /**
   * Agent modes configuration. Controls which operations the agent can
   * attempt and which users can use which access levels.
   */
  modes?: ModesConfig
  /** Custom text prepended to the auto-generated system prompt. */
  systemPrompt?: string
  /**
   * Token budget configuration for rate limiting.
   * Caps token usage per user (or globally) with configurable budgets.
   */
  tokenBudget?: TokenBudgetConfig
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
