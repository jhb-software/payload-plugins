/**
 * Shared types for the chat agent plugin.
 */

import { z } from 'zod'

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
        /** Custom component path for Payload's importMap system. */
        Component?: string
        /** Admin route path. Default: "/chat" */
        path?: `/${string}`
      }
    | false
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string
  /** Maximum tool-use loop steps per request. Default: 20 */
  maxSteps?: number
  /** Claude model ID. Default: "claude-sonnet-4-20250514" */
  model?: string
  /**
   * Agent modes configuration. Controls which operations the agent can
   * attempt and which users can use which access levels.
   */
  modes?: ModesConfig
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
