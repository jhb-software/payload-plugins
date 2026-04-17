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

import type { TextStreamPart, Tool, ToolSet } from 'ai'
import type { PayloadRequest } from 'payload'

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { isPluginAccessAllowed } from './access.js'
import { conversationEndpoints, conversationsCollection } from './conversations.js'
import {
  getDefaultMode,
  resolveAvailableModes,
  resolveModeConfig,
  validateModeAccess,
} from './modes.js'
import { buildSystemPrompt } from './system-prompt.js'
import { buildTools, discoverEndpoints, filterToolsByMode, PROVIDER_TOOL_NAMES } from './tools.js'

export {
  createPayloadBudget,
  type CreatePayloadBudgetOptions,
  type CreatePayloadBudgetResult,
  DEFAULT_USAGE_COLLECTION_SLUG,
  type PeriodResolver,
  type ScopeResolver,
} from './budget.js'
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
            const requestedMode = body.mode ?? getDefaultMode(modesConfig)
            const modeError = await validateModeAccess(requestedMode, modesConfig, req)
            if (modeError) {
              return Response.json({ error: modeError }, { status: 403 })
            }
            const mode = requestedMode as AgentMode

            // --- Budget check ----------------------------------------------
            // Surfaced as a 429 before we spend tokens. Errors from the
            // user-supplied check() are deliberately surfaced as 500 (not
            // swallowed) so a broken budget store fails loudly instead of
            // silently allowing unlimited spend.
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

            // --- Resolve overrideAccess ------------------------------------
            const overrideAccess = mode === 'superuser'

            // --- Discover custom endpoints and build tools ------------------
            const customEndpoints = discoverEndpoints(req.payload.config)
            const builtInTools = buildTools(
              req.payload,
              req.user,
              overrideAccess,
              req,
              customEndpoints,
              req.payload.config,
            )

            // --- Resolve user-provided custom tools --------------------------
            // Tool names must not collide with built-ins or the fixed slots
            // for provider-native tools (`webSearch`, `webFetch`), otherwise
            // a user could accidentally override a core tool with different
            // semantics. Surface the misconfiguration as a 500 instead of
            // silently overriding.
            let resolvedCustomTools: Record<string, Tool> = {}
            if (options.customTools) {
              try {
                resolvedCustomTools = await options.customTools({ req })
              } catch (err) {
                return Response.json(
                  {
                    error: `customTools resolver failed: ${err instanceof Error ? err.message : String(err)}`,
                  },
                  { status: 500 },
                )
              }
              const providerSlots: ReadonlySet<string> = new Set(PROVIDER_TOOL_NAMES)
              for (const name of Object.keys(resolvedCustomTools)) {
                if (name in builtInTools || providerSlots.has(name)) {
                  return Response.json(
                    {
                      error: `customTools: "${name}" collides with a built-in tool. Pick a different name.`,
                    },
                    { status: 500 },
                  )
                }
              }
            }

            // --- Assemble the final toolset ---------------------------------
            // Payload built-ins + user customTools + provider-native
            // web tools, merged in that order. Provider tools (type:
            // 'provider', no `execute`) are handled server-side by the
            // provider — no local execution path, no SSRF surface.
            const allTools: Record<string, Tool> = {
              ...builtInTools,
              ...resolvedCustomTools,
              ...(options.webSearch ? { webSearch: options.webSearch } : {}),
              ...(options.webFetch ? { webFetch: options.webFetch } : {}),
            }
            const tools = filterToolsByMode(allTools, mode)
            const systemPrompt = buildSystemPrompt(
              req.payload.config,
              options.systemPrompt,
              customEndpoints.length > 0,
              mode,
            )
            const modelId = body.model ?? options.defaultModel
            const maxSteps = options.maxSteps ?? 20

            // --- Resolve model from user-provided factory ------------------
            let resolvedModel
            try {
              resolvedModel = options.model(modelId)
            } catch (err) {
              return Response.json(
                {
                  error: `Failed to resolve model "${modelId}": ${err instanceof Error ? err.message : String(err)}`,
                },
                { status: 500 },
              )
            }

            // --- Budget recording hook -------------------------------------
            // Attached as `onFinish` (PromiseLike-aware) so the AI SDK awaits
            // it before closing the stream. Keeps the next check() for the
            // same user consistent with the spend we just observed.
            const record = options.budget?.record
            const onFinish = record
              ? async (event: {
                  totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
                }) => {
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
              : undefined

            // --- Stream response via AI SDK --------------------------------
            // Pass the request's abort signal so a client disconnect (tab
            // close, navigation, server timeout) aborts the in-flight LLM
            // call instead of racking up tokens on a stream nobody is
            // listening to.
            const result = streamText({
              abortSignal: req.signal,
              messages: await convertToModelMessages(
                body.messages as Parameters<typeof convertToModelMessages>[0],
              ),
              model: resolvedModel,
              onFinish,
              stopWhen: stepCountIs(maxSteps),
              system: systemPrompt,
              toolChoice: 'auto',
              tools,
            })

            // `X-Budget-Remaining` lets the client surface soft warnings as
            // users approach the cap. Only set when a numeric remaining was
            // returned (null = unlimited, i.e. no header).
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
