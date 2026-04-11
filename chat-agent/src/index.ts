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

import type { ChatAgentPluginOptions } from './types.js'

import { conversationEndpoints, conversationsCollection } from './conversations.js'
import { buildSystemPrompt } from './schema.js'
import {
  checkBudget,
  computeMaxOutputTokens,
  createUsageHandler,
  recordUsage,
  tokenUsageCollection,
} from './token-usage.js'
import { buildTools, discoverEndpoints } from './tools.js'

export type { ChatAgentPluginOptions, ModelOption, TokenBudgetConfig } from './types.js'
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

            // --- Resolve overrideAccess (superuser mode) -------------------
            let overrideAccess = false
            if (body.overrideAccess === true) {
              const superuserAccess = options.superuserAccess
              if (superuserAccess === true) {
                overrideAccess = true
              } else if (typeof superuserAccess === 'function') {
                overrideAccess = await superuserAccess(req)
              }
              // If superuserAccess is false/undefined, ignore the request
            }

            // --- Discover custom endpoints and build tools ------------------
            const customEndpoints = discoverEndpoints(req.payload.config)
            const tools = buildTools(req.payload, req.user, overrideAccess, req, customEndpoints)
            const systemPrompt = buildSystemPrompt(
              req.payload.config,
              options.systemPrompt,
              customEndpoints,
            )
            const modelId = body.model ?? options.defaultModel
            const maxSteps = options.maxSteps ?? 20

            // --- Cap per-request output by remaining budget ----------------
            const maxOutputTokens = computeMaxOutputTokens(budgetRemaining)

            // --- Stream response via AI SDK --------------------------------
            const result = streamText({
              messages: await (convertToModelMessages as any)(body.messages),
              ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
              model: createAnthropic({ apiKey })(modelId),
              stopWhen: stepCountIs(maxSteps),
              system: systemPrompt,
              toolChoice: 'auto',
              tools,
            })

            return result.toUIMessageStreamResponse({
              messageMetadata: ({ part }: { part: any }) => {
                if (part.type === 'finish') {
                  const inputTokens = part.totalUsage?.inputTokens ?? 0
                  const outputTokens = part.totalUsage?.outputTokens ?? 0
                  const totalTokens = part.totalUsage?.totalTokens ?? 0

                  // Record usage asynchronously (don't block the response).
                  // Log failures so billing drift doesn't happen silently.
                  if (options.tokenBudget && req.user) {
                    recordUsage(req.payload, req.user.id, options.tokenBudget.period ?? 'monthly', {
                      inputTokens,
                      outputTokens,
                      totalTokens,
                    }).catch((err: unknown) => {
                      req.payload.logger?.error?.(
                        { err, userId: req.user.id },
                        'chat-agent: failed to record token usage',
                      )
                    })
                  }

                  return {
                    inputTokens,
                    model: modelId,
                    outputTokens,
                    totalTokens,
                  }
                }
                return undefined
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
