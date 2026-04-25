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
import { runAgentImpl } from './runAgent.js'

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
          access: options.access,
          availableModels: options.availableModels,
          defaultModel: options.defaultModel,
          modesConfig,
          // Stash the raw plugin options so `runAgent(payload, opts)` can
          // pick them up off-HTTP without needing the consumer to wire a
          // factory through closures. See `src/runAgent.ts`.
          pluginOptions: options,
          suggestedPrompts: options.suggestedPrompts,
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
        // The HTTP handler is now a thin wrapper around `runAgentImpl`: it
        // owns parsing/validating the JSON body, gating with the plugin's
        // `access` function, surfacing the budget header + per-message
        // metadata, and translating `runAgent`'s thrown errors into the
        // appropriate HTTP status codes. The actual orchestration (mode
        // resolution, tool composition, system prompt build, model
        // resolution, `streamText` call) lives in `src/runAgent.ts` so
        // background jobs and the HTTP path share the same machinery.
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
            // Mode access is gated here at the HTTP boundary because it's a
            // user-facing authorization decision; `runAgentImpl` only does
            // the structural mode validation for headless callers.
            const requestedMode = body.mode ?? getDefaultMode(modesConfig)
            const modeError = await validateModeAccess(requestedMode, modesConfig, req)
            if (modeError) {
              return Response.json({ error: modeError }, { status: 403 })
            }
            const mode = requestedMode as AgentMode
            const overrideAccess = mode === 'superuser'

            // --- Budget pre-check ------------------------------------------
            // We pre-check here (and pass `skipBudget: true` to
            // `runAgentImpl`) for two reasons that don't fit into the
            // headless contract:
            //   1. An out-of-budget caller gets a 429 with a JSON body —
            //      cleaner than a thrown 500 from inside `runAgentImpl`.
            //   2. `X-Budget-Remaining` is set on the SSE response below
            //      from the value we observed here so the client can render
            //      soft warnings as the cap approaches.
            // Recording still runs at end-of-stream via the `onFinish`
            // option we hand to `runAgentImpl`.
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
            const record = options.budget?.record
            let result
            try {
              result = await runAgentImpl(options, req.payload, {
                abortSignal: req.signal,
                messages: body.messages as Parameters<typeof runAgentImpl>[2]['messages'],
                mode,
                model: modelId,
                onFinish: record
                  ? async (event) => {
                      await record({
                        model: modelId,
                        req,
                        usage: {
                          inputTokens: event.totalUsage?.inputTokens,
                          outputTokens: event.totalUsage?.outputTokens,
                          totalTokens: event.totalUsage?.totalTokens,
                        },
                      })
                    }
                  : undefined,
                overrideAccess,
                req,
                // Pre-check ran above and `onFinish` wires the recorder, so
                // tell runAgentImpl not to wire its own budget hooks.
                skipBudget: true,
                user: req.user,
              })
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              if (message.startsWith('tools resolver failed:')) {
                return Response.json({ error: message }, { status: 500 })
              }
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
