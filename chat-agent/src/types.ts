/**
 * Shared types for the chat agent plugin.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface ChatAgentPluginOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string
  /** Claude model ID. Default: "claude-sonnet-4-20250514" */
  model?: string
  /** Custom text prepended to the auto-generated system prompt. */
  systemPrompt?: string
  /** Override the default auth check (must return true to allow). */
  access?: (req: any) => boolean | Promise<boolean>
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
  superuserAccess?: boolean | ((req: any) => boolean | Promise<boolean>)
  /**
   * Admin panel chat view configuration.
   * - Omit or `{}` to auto-register at `/admin/chat` (default).
   * - `false` to disable the admin view entirely.
   * - `{ path, Component }` to customize the route or component.
   */
  adminView?:
    | false
    | {
        /** Admin route path. Default: "/chat" */
        path?: `/${string}`
        /** Custom component path for Payload's importMap. */
        Component?: string
      }
}

// ---------------------------------------------------------------------------
// Message metadata (attached to SSE stream, read by useChat on client)
// ---------------------------------------------------------------------------

export const messageMetadataSchema = z.object({
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
})

export type MessageMetadata = z.infer<typeof messageMetadataSchema>
