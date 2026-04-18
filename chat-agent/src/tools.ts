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
import type { PayloadRequest, SanitizedConfig } from 'payload'

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

const depth = z
  .number()
  .optional()
  .describe(
    'Depth of relationship population (default: 0 = IDs only). Increase only when you need related document fields.',
  )
const locale = z.string().optional().describe("Locale code for localized fields (e.g. 'en', 'de')")
const fallbackLocale = z
  .string()
  .optional()
  .describe('Fallback locale if the requested locale has no value.')
const select = z
  .record(z.string(), z.boolean())
  .optional()
  .describe(
    'Select specific fields. Object with field names as keys and true/false as values. Use this to reduce response size.',
  )
const populate = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Control which relationship fields to populate.')
const draft = z.boolean().optional().describe('If true, include draft documents.')

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

/** Minimal representation of a custom endpoint for the agent. */
export interface DiscoverableEndpoint {
  description?: string
  handler: (req: PayloadRequest) => Promise<Response> | Response
  method: string
  path: string
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
  user: unknown,
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
      description:
        'Query documents from a collection. Returns paginated results with docs, totalDocs, page, hasNextPage.',
      execute: async (input: Record<string, unknown>) => {
        return payload.find({
          collection: input.collection,
          limit: input.limit ?? 10,
          page: input.page ?? 1,
          sort: input.sort,
          where: input.where ?? {},
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string().describe("Collection slug (e.g. 'posts')"),
        depth,
        draft,
        fallbackLocale,
        limit: z.number().optional().describe('Max documents to return (default: 10)'),
        locale,
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
        populate,
        select,
        sort: z.string().optional().describe("Sort field. Prefix with '-' for descending"),
        where: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Payload where query. Example: { status: { equals: 'published' } }"),
      }),
    },

    findByID: {
      description: 'Get a single document by its ID.',
      execute: async (input: Record<string, unknown>) => {
        return payload.findByID({
          id: input.id,
          collection: input.collection,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        id: z.string().describe('Document ID'),
        collection: z.string().describe('Collection slug'),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    create: {
      description: 'Create a new document. Returns the created document.',
      execute: async (input: Record<string, unknown>) => {
        return payload.create({
          collection: input.collection,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        data: z.record(z.string(), z.unknown()).describe('Document data'),
        depth,
        draft,
        fallbackLocale,
        locale,
        select,
      }),
    },

    update: {
      description: 'Update a document by ID. Returns the updated document.',
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
        id: z.string().describe('Document ID to update'),
        collection: z.string().describe('Collection slug'),
        data: z
          .record(z.string(), z.unknown())
          .describe('Fields to update (partial, omitted fields unchanged)'),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    delete: {
      description: 'Delete a document by ID. Returns the deleted document.',
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
        id: z.string().describe('Document ID to delete'),
        collection: z.string().describe('Collection slug'),
        depth,
        select,
      }),
    },

    count: {
      description: 'Count documents matching a query. Returns { totalDocs: number }.',
      execute: async (input: Record<string, unknown>) => {
        return payload.count({
          collection: input.collection,
          where: input.where ?? {},
          ...access,
        })
      },
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        where: z.record(z.string(), z.unknown()).optional().describe('Payload where query'),
      }),
    },

    findGlobal: {
      description: 'Get a global document (singleton). One document per global slug.',
      execute: async (input: Record<string, unknown>) => {
        return payload.findGlobal({
          slug: input.slug,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        slug: z.string().describe("Global slug (e.g. 'settings')"),
        depth,
        draft,
        fallbackLocale,
        locale,
        populate,
        select,
      }),
    },

    updateGlobal: {
      description: 'Update a global document. Returns the updated global.',
      execute: async (input: Record<string, unknown>) => {
        return payload.updateGlobal({
          slug: input.slug,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
      inputSchema: z.object({
        slug: z.string().describe('Global slug'),
        data: z.record(z.string(), z.unknown()).describe('Fields to update'),
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
              'Get the field schema for a collection by slug. Call this before querying, filtering, or writing to a collection so you know which fields exist and their types.',
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
              slug: z
                .string()
                .describe('Collection slug (see the slug catalog in the system prompt)'),
            }),
          } satisfies ExecutableTool,

          getGlobalSchema: {
            description:
              'Get the field schema for a global by slug. Call this before reading or updating a global so you know which fields exist.',
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
              slug: z.string().describe('Global slug (see the slug catalog in the system prompt)'),
            }),
          } satisfies ExecutableTool,

          listBlocks: {
            description:
              'List all globally-declared blocks (config.blocks). These blocks can be referenced from `blocks` fields and inserted into lexical fields configured with BlocksFeature.',
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
              'Get the field schema for a globally-declared block by slug. Call listBlocks first to discover slugs. Returns { error } if the slug is unknown.',
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
              slug: z.string().describe('Block slug from listBlocks'),
            }),
          } satisfies ExecutableTool,
        }
      : {}),

    // --- Custom endpoint listing --------------------------------------------
    ...(customEndpoints && customEndpoints.length > 0
      ? {
          listEndpoints: {
            description:
              'List plugin-provided custom API endpoints that can be invoked via `callEndpoint`. Returns method, path, and description for each.',
            execute: () => {
              return {
                endpoints: customEndpoints.map((ep) => ({
                  description: ep.description,
                  method: ep.method.toUpperCase(),
                  path: ep.path,
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
            description:
              'Invoke a custom API endpoint. Call `listEndpoints` first to see which endpoints are available.',
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
                .describe('Request body (for POST/PUT/PATCH)'),
              method: z.enum(['get', 'post', 'put', 'patch', 'delete']).describe('HTTP method'),
              path: z
                .string()
                .describe(
                  "Full API path (e.g. '/api/posts/publish/123'). Must match one of the available custom endpoints.",
                ),
              query: z
                .record(z.string(), z.string())
                .optional()
                .describe('Query string parameters'),
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
