/**
 * Tool definitions for the chat agent, using the Vercel AI SDK tool format.
 *
 * Each tool maps 1:1 to a Payload Local API method. All calls use
 * `overrideAccess: false` so the agent inherits the logged-in user's
 * permissions — no privilege escalation.
 *
 * `buildTools(payload, user)` is called per-request so each tool's `execute`
 * function closes over the authenticated context.
 *
 * Note: We construct tool objects directly rather than using the `tool()`
 * helper because `tool()` is an identity function and its TypeScript overloads
 * don't resolve with zod v4 schemas.
 */

import type { Tool } from 'ai'
import type { PayloadRequest, SanitizedConfig, TypedUser } from 'payload'

import { z } from 'zod'

import type { PayloadConfigForPrompt, RawBlock } from './schema.js'
import type { AgentMode } from './types.js'

import { extractFields, normalizeLabel } from './schema.js'

// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

/** Built-in tools that only read data (safe in all modes). */
export const READ_TOOL_NAMES = [
  'find',
  'findByID',
  'count',
  'findGlobal',
  'getCollectionSchema',
  'getGlobalSchema',
  'listBlocks',
  'getBlockSchema',
  'listEndpoints',
] as const

/** Built-in tools that modify data (restricted in read/ask modes). */
export const WRITE_TOOL_NAMES = ['create', 'update', 'delete', 'updateGlobal'] as const

const readToolSet: ReadonlySet<string> = new Set(READ_TOOL_NAMES)

/**
 * Classify a tool as safe for `read` mode.
 *
 * A tool is a read if either:
 * - It's a built-in read tool (by name), or
 * - It has no `execute` function, i.e. it's a provider-native server-executed
 *   tool (e.g. `anthropic.tools.webSearch_*`). The provider runs it and the
 *   client can't approve after the fact, so gating it with `needsApproval`
 *   would invent a gate the plugin can't enforce.
 *
 * Everything else — built-in writes, `callEndpoint`, and user-defined tools
 * with an `execute` function — is treated as a write.
 */
function isReadTool(name: string, tool: Tool): boolean {
  if (readToolSet.has(name)) {
    return true
  }
  return typeof (tool as { execute?: unknown }).execute !== 'function'
}

// ---------------------------------------------------------------------------
// Shared Zod schemas (reused across tools)
// ---------------------------------------------------------------------------

const depth = z.number().optional().describe('Relationship depth. 0 (default) = IDs only.')
const locale = z.string().optional().describe("Locale code (e.g. 'en').")
const fallbackLocale = z.string().optional().describe('Fallback locale if requested is empty.')
const select = z
  .record(z.string(), z.boolean())
  .optional()
  .describe('Field selection: { fieldName: true | false }. Reduces response size.')
const populate = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Per-field relationship population.')
const draft = z.boolean().optional().describe('Include drafts.')

// ---------------------------------------------------------------------------
// Common params helper
// ---------------------------------------------------------------------------

function commonParams(input: Record<string, unknown>) {
  const params: Record<string, unknown> = {}
  if (input.depth !== undefined) {
    params.depth = input.depth
  } else {
    params.depth = 0
  }
  if (input.locale !== undefined) {
    params.locale = input.locale
  }
  if (input.fallbackLocale !== undefined) {
    params.fallbackLocale = input.fallbackLocale
  }
  if (input.select !== undefined) {
    params.select = input.select
  }
  if (input.populate !== undefined) {
    params.populate = input.populate
  }
  if (input.draft) {
    params.draft = true
  }
  return params
}

// ---------------------------------------------------------------------------
// Build tools (called per-request with authenticated context)
// ---------------------------------------------------------------------------

// Payload types are not available as a dependency — use structural types for
// the subset of the Local API we call.
interface PayloadLocalAPI {
  count(args: Record<string, unknown>): Promise<unknown>
  create(args: Record<string, unknown>): Promise<unknown>
  delete(args: Record<string, unknown>): Promise<unknown>
  find(args: Record<string, unknown>): Promise<unknown>
  findByID(args: Record<string, unknown>): Promise<unknown>
  findGlobal(args: Record<string, unknown>): Promise<unknown>
  update(args: Record<string, unknown>): Promise<unknown>
  updateGlobal(args: Record<string, unknown>): Promise<unknown>
}

type ExecutableTool = Required<Pick<Tool<Record<string, unknown>, unknown>, 'execute'>> &
  Tool<Record<string, unknown>, unknown>

/**
 * Request/response contract for a custom endpoint, read from
 * `endpoint.custom.schema`. Each leaf is intentionally `unknown` — it's
 * surfaced to the agent verbatim, not validated here.
 */
export interface EndpointSchema {
  /** Request body shape */
  body?: Record<string, unknown>
  /** Query string parameters */
  query?: Record<string, unknown>
  /** Response shape */
  response?: Record<string, unknown>
}

/** Minimal representation of a custom endpoint for the agent. */
export interface DiscoverableEndpoint {
  description?: string
  handler: (req: PayloadRequest) => Promise<Response> | Response
  method: string
  path: string
  /** Optional request/response contract declared via `endpoint.custom.schema`. */
  schema?: EndpointSchema
}

/**
 * Discover custom endpoints from Payload config that have a `custom.description`.
 * These are exposed to the chat agent as invocable tools.
 */
export function discoverEndpoints(config: SanitizedConfig): DiscoverableEndpoint[] {
  const endpoints: DiscoverableEndpoint[] = []

  for (const ep of config.endpoints ?? []) {
    // Skip our own chat plugin endpoints
    if (typeof ep.path === 'string' && ep.path.startsWith('/chat-agent/')) {
      continue
    }
    if (ep.custom?.description) {
      endpoints.push({
        description: ep.custom.description,
        handler: ep.handler,
        method: ep.method,
        path: `/api${ep.path}`,
        ...(ep.custom.schema && { schema: ep.custom.schema as EndpointSchema }),
      })
    }
  }

  for (const col of config.collections ?? []) {
    if (!Array.isArray(col.endpoints)) {
      continue
    }
    for (const ep of col.endpoints) {
      if (ep.custom?.description) {
        endpoints.push({
          description: ep.custom.description,
          handler: ep.handler,
          method: ep.method,
          path: `/api/${col.slug}${ep.path}`,
          ...(ep.custom.schema && { schema: ep.custom.schema as EndpointSchema }),
        })
      }
    }
  }

  for (const global of config.globals ?? []) {
    if (!Array.isArray(global.endpoints)) {
      continue
    }
    for (const ep of global.endpoints) {
      if (ep.custom?.description) {
        endpoints.push({
          description: ep.custom.description,
          handler: ep.handler,
          method: ep.method,
          path: `/api/globals/${global.slug}${ep.path}`,
          ...(ep.custom.schema && { schema: ep.custom.schema as EndpointSchema }),
        })
      }
    }
  }

  return endpoints
}

/**
 * Match a request path against an Express-style route pattern.
 * Returns parsed route params or null if no match.
 */
function matchRoute(pattern: string, path: string): null | Record<string, string> {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')
  if (patternParts.length !== pathParts.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i]
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}

export function buildTools(
  payload: PayloadLocalAPI,
  user: null | TypedUser,
  overrideAccess = false,
  /** The original request, used for calling custom endpoint handlers. */
  req?: PayloadRequest,
  /** Custom endpoints discoverable from config. */
  customEndpoints?: DiscoverableEndpoint[],
  /**
   * Payload config used by schema inspection tools (`getCollectionSchema`,
   * `getGlobalSchema`). When omitted, those tools are not registered.
   */
  config?: PayloadConfigForPrompt,
): Record<string, ExecutableTool> {
  const access = { overrideAccess, user }

  // Shared block registry for schema inspection — resolves `blockReferences`
  // in collection/global field trees to their field definitions.
  const blocksBySlug: Record<string, RawBlock> = {}
  for (const block of config?.blocks ?? []) {
    blocksBySlug[block.slug] = block
  }

  return {
    find: {
      description: 'Query a collection. Returns { docs, totalDocs, page, hasNextPage }.',
      execute: async (input: Record<string, unknown>) => {
        return payload.find({
          collection: input.collection,
          limit: input.limit,
          page: input.page,
          sort: input.sort,
          where: input.where ?? {},
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string(),
        depth,
        draft,
        fallbackLocale,
        limit: z.number().optional().describe('Max docs.'),
        locale,
        page: z.number().optional().describe('Page number.'),
        populate,
        select,
        sort: z.string().optional().describe("Sort field; prefix '-' for desc."),
        where: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Payload where query, e.g. { status: { equals: 'published' } }."),
      }),
    },

    findByID: {
      description: 'Get a document by ID.',
      execute: async (input: Record<string, unknown>) => {
        return payload.findByID({
          id: input.id,
          collection: input.collection,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        id: z.string(),
        collection: z.string(),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    create: {
      description: 'Create a document.',
      execute: async (input: Record<string, unknown>) => {
        return payload.create({
          collection: input.collection,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string(),
        data: z.record(z.string(), z.unknown()),
        depth,
        draft,
        fallbackLocale,
        locale,
        select,
      }),
    },

    update: {
      description: 'Update a document by ID. Partial — omitted fields are unchanged.',
      execute: async (input: Record<string, unknown>) => {
        return payload.update({
          id: input.id,
          collection: input.collection,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        id: z.string(),
        collection: z.string(),
        data: z.record(z.string(), z.unknown()),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    delete: {
      description: 'Delete a document by ID.',
      execute: async (input: Record<string, unknown>) => {
        return payload.delete({
          id: input.id,
          collection: input.collection,
          depth: (input.depth as number) ?? 0,
          select: input.select,
          ...access,
        })
      },
      inputSchema: z.object({
        id: z.string(),
        collection: z.string(),
        depth,
        select,
      }),
    },

    count: {
      description: 'Count documents matching a query.',
      execute: async (input: Record<string, unknown>) => {
        return payload.count({
          collection: input.collection,
          where: input.where ?? {},
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string(),
        where: z.record(z.string(), z.unknown()).optional(),
      }),
    },

    findGlobal: {
      description: 'Get a global (singleton) by slug.',
      execute: async (input: Record<string, unknown>) => {
        return payload.findGlobal({
          slug: input.slug,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        slug: z.string(),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    updateGlobal: {
      description: 'Update a global by slug.',
      execute: async (input: Record<string, unknown>) => {
        return payload.updateGlobal({
          slug: input.slug,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        slug: z.string(),
        data: z.record(z.string(), z.unknown()),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    // --- Schema inspection (on-demand field discovery) ----------------------
    // Registered only when the plugin has access to the Payload config. The
    // system prompt lists slugs; these tools hand back the full field shape
    // so the agent can query, filter, or write without needing to carry the
    // entire schema in the prompt.
    ...(config
      ? {
          getCollectionSchema: {
            description:
              "Get a collection's field schema. Call before querying, filtering, or writing to learn field names and types.",
            execute: (input: Record<string, unknown>) => {
              const slug = input.slug as string
              const collection = config.collections?.find((c) => c.slug === slug)
              if (!collection) {
                return { error: `Unknown collection slug "${slug}"` }
              }
              return {
                fields: extractFields(collection.fields ?? [], blocksBySlug),
                upload: Boolean(collection.upload),
              }
            },
            inputSchema: z.object({
              slug: z.string(),
            }),
          } satisfies ExecutableTool,

          getGlobalSchema: {
            description: "Get a global's field schema. Call before reading or updating.",
            execute: (input: Record<string, unknown>) => {
              const slug = input.slug as string
              const global = config.globals?.find((g) => g.slug === slug)
              if (!global) {
                return { error: `Unknown global slug "${slug}"` }
              }
              return {
                fields: extractFields(global.fields ?? [], blocksBySlug),
              }
            },
            inputSchema: z.object({
              slug: z.string(),
            }),
          } satisfies ExecutableTool,

          listBlocks: {
            description:
              'List globally-declared blocks (config.blocks). Used in `blocks` fields and lexical BlocksFeature.',
            execute: () => ({
              blocks: (config.blocks ?? []).map((block) => {
                const singular = normalizeLabel(block.labels?.singular)
                const plural = normalizeLabel(block.labels?.plural)
                const labels =
                  singular !== undefined || plural !== undefined
                    ? {
                        ...(singular !== undefined && { singular }),
                        ...(plural !== undefined && { plural }),
                      }
                    : undefined
                return {
                  slug: block.slug,
                  ...(labels && { labels }),
                  ...(typeof block.interfaceName === 'string' && {
                    interfaceName: block.interfaceName,
                  }),
                }
              }),
            }),
            inputSchema: z.object({}),
          } satisfies ExecutableTool,

          getBlockSchema: {
            description:
              "Get a block's field schema by slug. Call listBlocks first to discover slugs.",
            execute: (input: Record<string, unknown>) => {
              const slug = input.slug as string
              const block = blocksBySlug[slug]
              if (!block) {
                return { error: `Unknown block slug "${slug}"` }
              }
              const singular = normalizeLabel(block.labels?.singular)
              const plural = normalizeLabel(block.labels?.plural)
              const labels =
                singular !== undefined || plural !== undefined
                  ? {
                      ...(singular !== undefined && { singular }),
                      ...(plural !== undefined && { plural }),
                    }
                  : undefined
              return {
                slug,
                fields: extractFields(block.fields ?? [], blocksBySlug),
                ...(labels && { labels }),
                ...(typeof block.interfaceName === 'string' && {
                  interfaceName: block.interfaceName,
                }),
              }
            },
            inputSchema: z.object({
              slug: z.string(),
            }),
          } satisfies ExecutableTool,
        }
      : {}),

    // --- Custom endpoint listing --------------------------------------------
    ...(customEndpoints && customEndpoints.length > 0
      ? {
          listEndpoints: {
            description:
              'List custom endpoints invocable via `callEndpoint`. Returns method, path, description, and an optional request/response `schema` per endpoint.',
            execute: () => {
              return {
                endpoints: customEndpoints.map((ep) => ({
                  description: ep.description,
                  method: ep.method.toUpperCase(),
                  path: ep.path,
                  ...(ep.schema && { schema: ep.schema }),
                })),
              }
            },
            inputSchema: z.object({}),
          } satisfies ExecutableTool,
        }
      : {}),

    // --- Custom endpoint invocation -----------------------------------------
    ...(customEndpoints && customEndpoints.length > 0 && req
      ? {
          callEndpoint: {
            description: 'Invoke a custom endpoint. Run `listEndpoints` first to discover them.',
            execute: async (input: Record<string, unknown>) => {
              const path = input.path as string
              const method = (input.method as string).toLowerCase()
              const body = input.body as Record<string, unknown> | undefined
              const query = input.query as Record<string, string> | undefined

              // Find matching endpoint
              const match = customEndpoints.find((ep) => {
                if (ep.method !== method) {
                  return false
                }
                return matchRoute(ep.path, path) !== null
              })

              if (!match) {
                return {
                  error: `No custom endpoint matches ${method.toUpperCase()} ${path}`,
                }
              }

              const routeParams = matchRoute(match.path, path) ?? {}

              // Build a minimal request object by extending the original.
              // Use defineProperty for read-only properties like `method`.
              //
              // Every per-request field is reset explicitly so the forged
              // request can't inherit state from the chat request via the
              // prototype chain (e.g. the chat endpoint's own `searchParams`
              // leaking into a custom handler that forgot to use its own
              // query input).
              const endpointReq = Object.create(req)
              Object.defineProperty(endpointReq, 'method', {
                enumerable: true,
                value: method.toUpperCase(),
              })
              endpointReq.routeParams = routeParams
              endpointReq.json = () => Promise.resolve(body ?? {})
              endpointReq.searchParams =
                query && Object.keys(query).length > 0
                  ? new URLSearchParams(query)
                  : new URLSearchParams()

              try {
                const response = await match.handler(endpointReq)
                const contentType = response.headers?.get('content-type') ?? ''
                if (contentType.includes('json')) {
                  return await response.json()
                }
                return { body: await response.text(), status: response.status }
              } catch (err) {
                return {
                  error: err instanceof Error ? err.message : 'Endpoint handler threw an error',
                }
              }
            },
            inputSchema: z.object({
              body: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('Request body for POST/PUT/PATCH.'),
              method: z.enum(['get', 'post', 'put', 'patch', 'delete']),
              path: z
                .string()
                .describe(
                  "Full path, e.g. '/api/posts/publish/123'. Must match a listed endpoint.",
                ),
              query: z.record(z.string(), z.string()).optional(),
            }),
          } satisfies ExecutableTool,
        }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Tool filtering by agent mode
// ---------------------------------------------------------------------------

/**
 * Filter tools based on the active agent mode.
 *
 * - `read`:       Only read tools. Provider-native tools (no `execute`) are
 *                 kept; everything else with an `execute` function is dropped.
 * - `ask`:        All tools, but anything classified as a write gains
 *                 `needsApproval: true` so the AI SDK pauses on it and waits
 *                 for a client approval response before executing.
 * - `read-write`: All tools unchanged.
 * - `superuser`:  All tools unchanged (overrideAccess is handled at build time).
 */
export function filterToolsByMode<T extends Tool>(
  tools: Record<string, T>,
  mode: AgentMode,
): Record<string, T> {
  if (mode === 'read') {
    const filtered: Record<string, T> = {}
    for (const [name, tool] of Object.entries(tools)) {
      if (isReadTool(name, tool)) {
        filtered[name] = tool
      }
    }
    return filtered
  }

  if (mode === 'ask') {
    const result: Record<string, T> = {}
    for (const [name, tool] of Object.entries(tools)) {
      if (isReadTool(name, tool)) {
        result[name] = tool
      } else {
        result[name] = { ...tool, needsApproval: true } as T
      }
    }
    return result
  }

  // read-write and superuser: all tools unchanged
  return tools
}
