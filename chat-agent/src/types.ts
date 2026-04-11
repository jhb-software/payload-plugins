/**
 * Shared types for the chat agent plugin.
 */

import type { LanguageModel } from 'ai'

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
