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
import { z } from 'zod'

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
  if (input.depth !== undefined) params.depth = input.depth
  else params.depth = 0
  if (input.locale !== undefined) params.locale = input.locale
  if (input.fallbackLocale !== undefined) params.fallbackLocale = input.fallbackLocale
  if (input.select !== undefined) params.select = input.select
  if (input.populate !== undefined) params.populate = input.populate
  if (input.draft) params.draft = true
  return params
}

// ---------------------------------------------------------------------------
// Build tools (called per-request with authenticated context)
// ---------------------------------------------------------------------------

// Payload types are not available as a dependency — use structural types for
// the subset of the Local API we call.
interface PayloadLocalAPI {
  find(args: Record<string, unknown>): Promise<unknown>
  findByID(args: Record<string, unknown>): Promise<unknown>
  create(args: Record<string, unknown>): Promise<unknown>
  update(args: Record<string, unknown>): Promise<unknown>
  delete(args: Record<string, unknown>): Promise<unknown>
  count(args: Record<string, unknown>): Promise<unknown>
  findGlobal(args: Record<string, unknown>): Promise<unknown>
  updateGlobal(args: Record<string, unknown>): Promise<unknown>
}

type ExecutableTool = Tool<Record<string, unknown>, unknown> &
  Required<Pick<Tool<Record<string, unknown>, unknown>, 'execute'>>

/** Minimal representation of a custom endpoint for the agent. */
export interface DiscoverableEndpoint {
  path: string
  method: string
  handler: (req: any) => Promise<Response> | Response
  description?: string
}

/**
 * Discover custom endpoints from Payload config that have a `custom.description`.
 * These are exposed to the chat agent as invocable tools.
 */
export function discoverEndpoints(config: any): DiscoverableEndpoint[] {
  const endpoints: DiscoverableEndpoint[] = []

  for (const ep of config.endpoints ?? []) {
    // Skip our own chat plugin endpoints
    if (typeof ep.path === 'string' && ep.path.startsWith('/chat-agent/')) continue
    if (ep.custom?.description) {
      endpoints.push({
        path: `/api${ep.path}`,
        method: ep.method,
        handler: ep.handler,
        description: ep.custom.description,
      })
    }
  }

  for (const col of config.collections ?? []) {
    if (!Array.isArray(col.endpoints)) continue
    for (const ep of col.endpoints) {
      if (ep.custom?.description) {
        endpoints.push({
          path: `/api/${col.slug}${ep.path}`,
          method: ep.method,
          handler: ep.handler,
          description: ep.custom.description,
        })
      }
    }
  }

  for (const global of config.globals ?? []) {
    if (!Array.isArray(global.endpoints)) continue
    for (const ep of global.endpoints) {
      if (ep.custom?.description) {
        endpoints.push({
          path: `/api/globals/${global.slug}${ep.path}`,
          method: ep.method,
          handler: ep.handler,
          description: ep.custom.description,
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
function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')
  if (patternParts.length !== pathParts.length) return null

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
  req?: any,
  /** Custom endpoints discoverable from config. */
  customEndpoints?: DiscoverableEndpoint[],
): Record<string, ExecutableTool> {
  const access = { overrideAccess, user }

  return {
    find: {
      description:
        'Query documents from a collection. Returns paginated results with docs, totalDocs, page, hasNextPage.',
      inputSchema: z.object({
        collection: z.string().describe("Collection slug (e.g. 'posts')"),
        where: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Payload where query. Example: { status: { equals: 'published' } }"),
        select,
        limit: z.number().optional().describe('Max documents to return (default: 10)'),
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
        sort: z.string().optional().describe("Sort field. Prefix with '-' for descending"),
        depth,
        locale,
        fallbackLocale,
        populate,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.find({
          collection: input.collection,
          where: input.where ?? {},
          limit: input.limit ?? 10,
          page: input.page ?? 1,
          sort: input.sort,
          ...commonParams(input),
          ...access,
        })
      },
    },

    findByID: {
      description: 'Get a single document by its ID.',
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        id: z.string().describe('Document ID'),
        select,
        depth,
        locale,
        fallbackLocale,
        populate,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.findByID({
          collection: input.collection,
          id: input.id,
          ...commonParams(input),
          ...access,
        })
      },
    },

    create: {
      description: 'Create a new document. Returns the created document.',
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        data: z.record(z.string(), z.unknown()).describe('Document data'),
        select,
        depth,
        locale,
        fallbackLocale,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.create({
          collection: input.collection,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
    },

    update: {
      description: 'Update a document by ID. Returns the updated document.',
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        id: z.string().describe('Document ID to update'),
        data: z
          .record(z.string(), z.unknown())
          .describe('Fields to update (partial, omitted fields unchanged)'),
        select,
        depth,
        locale,
        fallbackLocale,
        populate,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.update({
          collection: input.collection,
          id: input.id,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
    },

    delete: {
      description: 'Delete a document by ID. Returns the deleted document.',
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        id: z.string().describe('Document ID to delete'),
        depth,
        select,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.delete({
          collection: input.collection,
          id: input.id,
          depth: (input.depth as number) ?? 0,
          select: input.select,
          ...access,
        })
      },
    },

    count: {
      description: 'Count documents matching a query. Returns { totalDocs: number }.',
      inputSchema: z.object({
        collection: z.string().describe('Collection slug'),
        where: z.record(z.string(), z.unknown()).optional().describe('Payload where query'),
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.count({
          collection: input.collection,
          where: input.where ?? {},
          ...access,
        })
      },
    },

    findGlobal: {
      description: 'Get a global document (singleton). One document per global slug.',
      inputSchema: z.object({
        slug: z.string().describe("Global slug (e.g. 'settings')"),
        select,
        depth,
        locale,
        fallbackLocale,
        populate,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.findGlobal({
          slug: input.slug,
          ...commonParams(input),
          ...access,
        })
      },
    },

    updateGlobal: {
      description: 'Update a global document. Returns the updated global.',
      inputSchema: z.object({
        slug: z.string().describe('Global slug'),
        data: z.record(z.string(), z.unknown()).describe('Fields to update'),
        select,
        depth,
        locale,
        fallbackLocale,
        populate,
        draft,
      }),
      execute: async (input: Record<string, unknown>) => {
        return payload.updateGlobal({
          slug: input.slug,
          data: input.data,
          ...commonParams(input),
          ...access,
        })
      },
    },

    // --- Custom endpoint invocation -----------------------------------------
    ...(customEndpoints && customEndpoints.length > 0 && req
      ? {
          callEndpoint: {
            description:
              "Invoke a custom API endpoint. Use this to call plugin-provided endpoints listed in the system prompt under 'Custom Endpoints'.",
            inputSchema: z.object({
              path: z
                .string()
                .describe(
                  "Full API path (e.g. '/api/posts/publish/123'). Must match one of the available custom endpoints.",
                ),
              method: z.enum(['get', 'post', 'put', 'patch', 'delete']).describe('HTTP method'),
              body: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('Request body (for POST/PUT/PATCH)'),
              query: z
                .record(z.string(), z.string())
                .optional()
                .describe('Query string parameters'),
            }),
            execute: async (input: Record<string, unknown>) => {
              const path = input.path as string
              const method = (input.method as string).toLowerCase()
              const body = input.body as Record<string, unknown> | undefined
              const query = input.query as Record<string, string> | undefined

              // Find matching endpoint
              const match = customEndpoints.find((ep) => {
                if (ep.method !== method) return false
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
              const endpointReq = Object.create(req)
              Object.defineProperty(endpointReq, 'method', {
                value: method.toUpperCase(),
                enumerable: true,
              })
              endpointReq.routeParams = routeParams
              endpointReq.json = () => Promise.resolve(body ?? {})

              if (query && Object.keys(query).length > 0) {
                endpointReq.searchParams = new URLSearchParams(query)
              }

              try {
                const response = await match.handler(endpointReq)
                const contentType = response.headers?.get('content-type') ?? ''
                if (contentType.includes('json')) {
                  return await response.json()
                }
                return { status: response.status, body: await response.text() }
              } catch (err: any) {
                return {
                  error: err?.message ?? 'Endpoint handler threw an error',
                }
              }
            },
          } satisfies ExecutableTool,
        }
      : {}),
  }
}
