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
   * Controls who can use superuser mode (overrideAccess: true).
   * - Omit or `false` to disable superuser mode entirely (default).
   * - `true` to allow any authenticated user.
   * - A function receiving the request, returning true to allow.
   *
   * Example: `(req) => req.user?.role === 'admin'`
   */
  superuserAccess?: ((req: any) => boolean | Promise<boolean>) | boolean
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
