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

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import type { ChatAgentPluginOptions } from './types.js'

import { conversationEndpoints, conversationsCollection } from './conversations.js'
import { buildSystemPrompt } from './schema.js'
import { buildTools, discoverEndpoints } from './tools.js'

export type { ChatAgentPluginOptions, ModelFactory, ModelOption } from './types.js'
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

    return {
      ...config,
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: adminViews,
        },
      },
      collections: [...(config.collections ?? []), conversationsCollection],
      endpoints: [
        ...(config.endpoints ?? []),
        ...conversationEndpoints,
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

            // --- Stream response via AI SDK --------------------------------
            const result = streamText({
              messages: await (convertToModelMessages as any)(body.messages),
              model: resolvedModel,
              stopWhen: stepCountIs(maxSteps),
              system: systemPrompt,
              toolChoice: 'auto',
              tools,
            })

            return result.toUIMessageStreamResponse({
              messageMetadata: ({ part }: { part: any }) => {
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
      ],
    }
  }
}
