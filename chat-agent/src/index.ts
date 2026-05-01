/**
 * Chat Agent Plugin for Payload CMS.
 *
 * Adds a `/api/chat-agent/chat` endpoint that connects an AI agent to the
 * Payload Local API. Uses the Vercel AI SDK for streaming and tool use, and
 * is provider-agnostic — install whichever `@ai-sdk/*` package you want
 * (Anthropic, OpenAI, Google, etc.) and pass a `model` factory.
 *
 * Usage in payload.config.ts:
 *   import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
 *   import { createOpenAI } from '@ai-sdk/openai'
 *   const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
 *   export default buildConfig({
 *     plugins: [
 *       chatAgentPlugin({
 *         defaultModel: 'gpt-4o-mini',
 *         model: (id) => openai(id),
 *       }),
 *     ],
 *   })
 */

import type { TextStreamPart, ToolSet } from 'ai'
import type { PayloadRequest } from 'payload'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { isPluginAccessAllowed } from './access.js'
import { conversationEndpoints, conversationsCollection } from './conversations.js'
import {
  getDefaultMode,
  resolveAvailableModes,
  resolveModeConfig,
  validateModeAccess,
} from './modes.js'
import { composeOnFinish, runAgentImpl, ToolsResolverError } from './runAgent.js'

export {
  createPayloadBudget,
  type CreatePayloadBudgetOptions,
  type CreatePayloadBudgetResult,
  DEFAULT_USAGE_COLLECTION_SLUG,
  type PeriodResolver,
  type ScopeResolver,
} from './budget.js'
export { runAgent, type RunAgentOptions, type RunAgentResult } from './runAgent.js'
export type { BudgetConfig, BudgetUsage } from './types.js'
export type { ChatAgentPluginOptions, ModelFactory, ModelOption } from './types.js'
export { AGENT_MODES, type AgentMode, type ModesConfig } from './types.js'
export { type MessageMetadata, messageMetadataSchema } from './types.js'

// Server components are exported from `./server` — NOT from the main entry —
// so that `payload generate:importmap` can load the plugin under tsx without
// triggering a CSS import chain (DefaultTemplate → @payloadcms/ui → react-image-crop).
const CHAT_VIEW_COMPONENT = '@jhb.software/payload-chat-agent/server#ChatViewServer'
const CHAT_NAV_LINK_COMPONENT = '@jhb.software/payload-chat-agent/server#ChatNavLinkServer'

/**
 * Validate that a messages array is non-empty and has valid roles.
 * Returns an error string if invalid, or null if valid.
 */
export function validateMessages(messages: unknown): null | string {
  if (!Array.isArray(messages)) {
    return '"messages" must be an array'
  }
  if (messages.length === 0) {
    return '"messages" must not be empty'
  }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || typeof msg !== 'object') {
      return `messages[${i}] must be an object`
    }
    if (!msg.role || typeof msg.role !== 'string') {
      return `messages[${i}].role must be a string`
    }
  }
  return null
}

export function chatAgentPlugin(options: ChatAgentPluginOptions) {
  // --- Validate options at construction time --------------------------------
  // Fail fast on misconfiguration so the issue surfaces at Payload startup
  // instead of as a confusing per-request error.
  if (
    options.availableModels &&
    options.availableModels.length > 0 &&
    !options.availableModels.some((m) => m.id === options.defaultModel)
  ) {
    const ids = options.availableModels.map((m) => m.id).join(', ')
    throw new Error(
      `chatAgentPlugin: defaultModel "${options.defaultModel}" is not in availableModels [${ids}]. ` +
        `Either add it to availableModels or change defaultModel to one of the listed ids.`,
    )
  }

  const modesConfig = resolveModeConfig(options)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin wrappers receive the in-flight user config, which hasn't been fully sanitized to `Config` yet.
  return (config: any): any => {
    // Always register the admin chat view. `adminView` customizes route/component.
    const chatPath = options.adminView?.path ?? '/chat'
    const adminViews = {
      ...config.admin?.components?.views,
      chat: {
        Component: options.adminView?.Component ?? CHAT_VIEW_COMPONENT,
        path: chatPath,
      },
    }

    // Inject a "Chat" link at the top of the admin nav sidebar by default.
    // Opt out with `navLink: false`.
    const showNavLink = options.navLink !== false
    const beforeNavLinks = showNavLink
      ? [
          ...(config.admin?.components?.beforeNavLinks ?? []),
          {
            clientProps: { path: chatPath },
            path: CHAT_NAV_LINK_COMPONENT,
          },
        ]
      : config.admin?.components?.beforeNavLinks

    return {
      ...config,
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          beforeNavLinks,
          views: adminViews,
        },
      },
      collections: [...(config.collections ?? []), conversationsCollection],
      custom: {
        ...config.custom,
        chatAgent: {
          modesConfig,
          // The full plugin options, exposed so `runAgent(req, opts)` and
          // other consumers (admin views, access guard, /models endpoint)
          // can read fields off it without re-threading the raw `options`
          // argument through closures. See `src/plugin-custom-config.ts`.
          pluginOptions: options,
        },
      },
      endpoints: [
        ...(config.endpoints ?? []),
        ...conversationEndpoints,

        // --- GET /chat-agent/modes ------------------------------------------
        {
          handler: async (req: PayloadRequest) => {
            if (!(await isPluginAccessAllowed(req))) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const available = await resolveAvailableModes(modesConfig, req)
            return Response.json({
              default: getDefaultMode(modesConfig),
              modes: available,
              ...(options.suggestedPrompts?.length
                ? { suggestedPrompts: options.suggestedPrompts }
                : {}),
            })
          },
          method: 'get',
          path: '/chat-agent/modes',
        },

        // --- GET /chat-agent/chat/models ------------------------------------
        {
          handler: async (req: PayloadRequest) => {
            if (!(await isPluginAccessAllowed(req))) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 })
            }
            return Response.json({
              availableModels: options.availableModels ?? [],
              defaultModel: options.defaultModel,
            })
          },
          method: 'get',
          path: '/chat-agent/chat/models',
        },

        // --- POST /chat-agent/chat ------------------------------------------
        {
          handler: async (req: PayloadRequest) => {
            // --- Auth check -----------------------------------------------
            if (!(await isPluginAccessAllowed(req))) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 })
            }

            // --- Validate model factory -----------------------------------
            if (typeof options.model !== 'function') {
              return Response.json(
                {
                  error:
                    'Chat agent plugin is misconfigured: the `model` option must be a function returning a LanguageModel. See https://github.com/jhb-software/payload-plugins/tree/main/chat-agent#setup',
                },
                { status: 500 },
              )
            }

            // --- Parse and validate body -----------------------------------
            let body: { messages?: unknown; mode?: string; model?: string }
            try {
              body = (await req.json?.()) as typeof body
            } catch {
              return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
            }

            const validationError = validateMessages(body?.messages)
            if (validationError) {
              return Response.json({ error: validationError }, { status: 400 })
            }

            // --- Validate model against available list ---------------------
            const availableModels = options.availableModels
            if (
              body.model &&
              availableModels &&
              availableModels.length > 0 &&
              !availableModels.some((m) => m.id === body.model)
            ) {
              return Response.json(
                {
                  error: `Model "${body.model}" is not available. Available models: ${availableModels.map((m) => m.id).join(', ')}`,
                },
                { status: 400 },
              )
            }

            // --- Resolve mode ----------------------------------------------
            // Per-mode access checks live at the HTTP boundary; `runAgentImpl`
            // doesn't run them (background callers supply their own authority).
            const requestedMode = body.mode ?? getDefaultMode(modesConfig)
            const modeError = await validateModeAccess(requestedMode, modesConfig, req)
            if (modeError) {
              return Response.json({ error: modeError }, { status: 403 })
            }
            const mode = requestedMode as AgentMode
            const overrideAccess = mode === 'superuser'

            // --- Budget pre-check ------------------------------------------
            // Pre-check here so an out-of-budget caller gets a 429 (instead
            // of a thrown 500 from `runAgentImpl`) and so `X-Budget-Remaining`
            // can be set on the SSE response. Recording runs end-of-stream
            // via the `onFinish` option below; we pass `skipBudget: true` to
            // `runAgentImpl` to avoid double-counting.
            let remaining: null | number = null
            if (options.budget) {
              try {
                remaining = await options.budget.check({ req })
              } catch (err) {
                return Response.json(
                  {
                    error: `Budget check failed: ${err instanceof Error ? err.message : String(err)}`,
                  },
                  { status: 500 },
                )
              }
              if (remaining !== null && remaining <= 0) {
                return Response.json(
                  { error: 'Token budget exceeded', remaining: 0 },
                  { status: 429 },
                )
              }
            }

            // --- Delegate to `runAgentImpl` --------------------------------
            const modelId = body.model ?? options.defaultModel
            let result
            try {
              result = await runAgentImpl(options, req, {
                abortSignal: req.signal,
                messages: body.messages as Parameters<typeof runAgentImpl>[2]['messages'],
                mode,
                model: modelId,
                // Budget was pre-checked above for the 429 + header; record
                // end-of-stream via the shared composer so `runAgentImpl`
                // doesn't run a second `check()`.
                onFinish: composeOnFinish({
                  budget: options.budget,
                  callerOnFinish: undefined,
                  modelId,
                  req,
                }),
                overrideAccess,
                skipBudget: true,
              })
            } catch (err) {
              if (err instanceof ToolsResolverError) {
                return Response.json({ error: err.message }, { status: 500 })
              }
              const message = err instanceof Error ? err.message : String(err)
              return Response.json(
                { error: `Failed to resolve model "${modelId}": ${message}` },
                { status: 500 },
              )
            }

            const headers =
              remaining !== null ? { 'X-Budget-Remaining': String(remaining) } : undefined

            return result.toUIMessageStreamResponse({
              headers,
              messageMetadata: ({ part }: { part: TextStreamPart<ToolSet> }) => {
                if (part.type === 'finish') {
                  return {
                    inputTokens: part.totalUsage?.inputTokens,
                    model: modelId,
                    outputTokens: part.totalUsage?.outputTokens,
                    totalTokens: part.totalUsage?.totalTokens,
                  }
                }
                return undefined
              },
            })
          },
          method: 'post',
          path: '/chat-agent/chat',
        },

        // --- GET /chat-agent/budget -----------------------------------------
        // Only registered when a budget is configured, so clients can detect
        // the feature by checking for a 404 vs. a real response. Thin wrapper
        // over the user's check() so no duplication of scope/period logic.
        ...(options.budget
          ? [
              {
                handler: async (req: PayloadRequest) => {
                  if (!(await isPluginAccessAllowed(req))) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401 })
                  }
                  const r = await options.budget!.check({ req })
                  return Response.json({ remaining: r })
                },
                method: 'get' as const,
                path: '/chat-agent/budget',
              },
            ]
          : []),
      ],
    }
  }
}
