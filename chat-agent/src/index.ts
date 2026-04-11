/**
 * Chat Agent Plugin for Payload CMS.
 *
 * Adds a `/api/chat-agent/chat` endpoint that connects an AI agent (Claude)
 * to the Payload Local API. Uses the Vercel AI SDK for streaming and tool use.
 *
 * Usage in payload.config.ts:
 *   import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
 *   export default buildConfig({
 *     plugins: [chatAgentPlugin({ apiKey: '...', defaultModel: 'claude-sonnet-4-20250514' })],
 *   })
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

import { conversationEndpoints, conversationsCollection } from './conversations.js'
import {
  getDefaultMode,
  resolveAvailableModes,
  resolveModeConfig,
  validateModeAccess,
} from './modes.js'
import { buildSystemPrompt } from './schema.js'
import {
  checkBudget,
  computeMaxOutputTokens,
  createBudgetStopCondition,
  createUsageHandler,
  recordUsageAndLogErrors,
  sanitizeTokenCount,
  tokenUsageCollection,
} from './token-usage.js'
import { buildTools, discoverEndpoints, filterToolsByMode } from './tools.js'

export type { ChatAgentPluginOptions, ModelOption, TokenBudgetConfig } from './types.js'
export { AGENT_MODES, type AgentMode, type ModesConfig } from './types.js'
export { type MessageMetadata, messageMetadataSchema } from './types.js'
export { default as ChatViewServer } from './ui/ChatViewServer.js'

/**
 * The package-relative path to the ChatView component.
 * Used by Payload's importMap system.
 */
const CHAT_VIEW_COMPONENT = '@jhb.software/payload-chat-agent#ChatViewServer'

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
  const modesConfig = resolveModeConfig(options)

  return (config: any): any => {
    // Auto-register the admin chat view unless explicitly disabled
    const adminViews =
      options.adminView === false
        ? config.admin?.components?.views
        : {
            ...config.admin?.components?.views,
            chat: {
              Component: options.adminView?.Component ?? CHAT_VIEW_COMPONENT,
              path: options.adminView?.path ?? '/chat',
            },
          }

    // Build the list of additional endpoints
    const budgetEndpoints = options.tokenBudget
      ? [
          {
            handler: createUsageHandler(options.tokenBudget),
            method: 'get' as const,
            path: '/chat-agent/usage',
          },
        ]
      : []

    // Include token-usage collection only when budget is configured
    const budgetCollections = options.tokenBudget ? [tokenUsageCollection] : []

    return {
      ...config,
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: adminViews,
        },
      },
      collections: [...(config.collections ?? []), conversationsCollection, ...budgetCollections],
      endpoints: [
        ...(config.endpoints ?? []),
        ...conversationEndpoints,
        ...budgetEndpoints,

        // --- GET /chat-agent/modes ------------------------------------------
        {
          handler: async (req: any) => {
            const allowed = options.access ? await options.access(req) : !!req.user
            if (!allowed) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const available = await resolveAvailableModes(modesConfig, req)
            return Response.json({
              default: getDefaultMode(modesConfig),
              modes: available,
            })
          },
          method: 'get',
          path: '/chat-agent/modes',
        },

        // --- GET /chat-agent/chat/models ------------------------------------
        {
          handler: () => {
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
          handler: async (req: any) => {
            // --- Auth check -----------------------------------------------
            const allowed = options.access ? await options.access(req) : !!req.user
            if (!allowed) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 })
            }

            // --- Resolve API key ------------------------------------------
            const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
            if (!apiKey) {
              return Response.json(
                {
                  error:
                    'Anthropic API key not configured. Set the apiKey option or ANTHROPIC_API_KEY environment variable.',
                },
                { status: 500 },
              )
            }

            // --- Parse and validate body -----------------------------------
            let body: any
            try {
              body = await req.json()
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

            // --- Budget enforcement ----------------------------------------
            // Fail-closed when a budget is configured but the request has
            // no identifiable user. Skipping silently would let anyone
            // using a custom auth scheme bypass the budget entirely.
            if (options.tokenBudget && !req.user) {
              return Response.json(
                {
                  error:
                    'Token budget is configured, but this request has no authenticated user. ' +
                    'Token budgets require a user context to attribute usage.',
                },
                { status: 401 },
              )
            }
            let budgetRemaining: null | number = null
            if (options.tokenBudget && req.user) {
              const budgetResult = await checkBudget(
                req.payload,
                req.user.id,
                options.tokenBudget,
                req,
              )
              if (!budgetResult.allowed) {
                return Response.json(
                  {
                    error: `Token budget exceeded. Resets on ${budgetResult.resetDate}.`,
                    limit: budgetResult.limit,
                    resetDate: budgetResult.resetDate,
                    totalTokens: budgetResult.totalTokens,
                  },
                  { status: 429 },
                )
              }
              budgetRemaining = budgetResult.remaining
            }

            // --- Resolve mode ----------------------------------------------
            const requestedMode = body.mode ?? getDefaultMode(modesConfig)
            const modeError = await validateModeAccess(requestedMode, modesConfig, req)
            if (modeError) {
              return Response.json({ error: modeError }, { status: 403 })
            }
            const mode = requestedMode as AgentMode

            // --- Resolve overrideAccess ------------------------------------
            const overrideAccess = mode === 'superuser'

            // --- Discover custom endpoints and build tools ------------------
            const customEndpoints = discoverEndpoints(req.payload.config)
            const allTools = buildTools(req.payload, req.user, overrideAccess, req, customEndpoints)
            const tools = filterToolsByMode(allTools, mode)
            const systemPrompt = buildSystemPrompt(
              req.payload.config,
              options.systemPrompt,
              customEndpoints,
              mode,
            )
            const modelId = body.model ?? options.defaultModel
            const maxSteps = options.maxSteps ?? 20

            // --- Per-request budget enforcement ----------------------------
            // `maxOutputTokens` bounds a single step. Combined with the
            // budgetStopCondition it bounds the total per-request spend to
            // roughly `remaining + maxOutputTokens` (worst case: the step
            // that trips the budget can still emit a full output).
            const maxOutputTokens = computeMaxOutputTokens(budgetRemaining)
            const stopConditions = [stepCountIs(maxSteps)]
            if (budgetRemaining !== null) {
              stopConditions.push(createBudgetStopCondition(budgetRemaining))
            }

            // --- Stream response via AI SDK --------------------------------
            const result = streamText({
              messages: await (convertToModelMessages as any)(body.messages),
              ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
              model: createAnthropic({ apiKey })(modelId),
              stopWhen: stopConditions,
              system: systemPrompt,
              toolChoice: 'auto',
              tools,
            })

            // Capture state from the finish metadata for use in onFinish.
            // `messageMetadata` is synchronous (the SDK awaits it inline),
            // but `recordUsage` needs to await a DB write which the SDK
            // must not block the outgoing stream on. Instead, we stash the
            // numbers in closure state and do the write in `onFinish`,
            // which the SDK does `await` before tearing down the stream —
            // this keeps the serverless function alive long enough for the
            // write to complete.
            let finalUsage: {
              inputTokens: number
              outputTokens: number
              totalTokens: number
            } | null = null

            return result.toUIMessageStreamResponse({
              messageMetadata: ({ part }: { part: any }) => {
                if (part.type === 'finish') {
                  const inputTokens = sanitizeTokenCount(part.totalUsage?.inputTokens)
                  const outputTokens = sanitizeTokenCount(part.totalUsage?.outputTokens)
                  const totalTokens = sanitizeTokenCount(part.totalUsage?.totalTokens)
                  finalUsage = { inputTokens, outputTokens, totalTokens }
                  return {
                    inputTokens,
                    model: modelId,
                    outputTokens,
                    totalTokens,
                  }
                }
                return undefined
              },
              onFinish: async () => {
                if (!options.tokenBudget || !req.user || !finalUsage) {
                  return
                }
                await recordUsageAndLogErrors({
                  payload: req.payload,
                  period: options.tokenBudget.period ?? 'monthly',
                  tokens: finalUsage,
                  userId: req.user.id,
                })
              },
            })
          },
          method: 'post',
          path: '/chat-agent/chat',
        },
      ],
    }
  }
}
