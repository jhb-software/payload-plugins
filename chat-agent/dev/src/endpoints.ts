import type { Endpoint, PayloadRequest } from 'payload'

import { runAgent } from '@jhb.software/payload-chat-agent'

/** Root-level endpoints (mounted under `/api`). */
export const rootEndpoints: Endpoint[] = [
  // -------------------------------------------------------------------------
  // POST /api/audit-content — headless agent run, the cron-friendly shape
  // -------------------------------------------------------------------------
  // Demonstrates how a scheduled job (Vercel Cron, GitHub Actions, a Payload
  // task) would trigger the agent: hit this endpoint on a schedule, the
  // handler awaits `runAgent` to completion, and replies with the result.
  // No browser, no SSE, no user session.
  //
  // Auth: the cron runner authenticates as a `service-accounts` document via
  // its API key — `Authorization: service-accounts API-Key <key>`. Payload's
  // built-in API-key strategy resolves `req.user` to the matching service
  // account before this handler runs, so the agent's tool calls inherit
  // that account's permissions instead of running as `null + overrideAccess`.
  //
  // Try it locally:
  //   curl -X POST http://localhost:3940/api/audit-content \
  //     -H 'Content-Type: application/json' \
  //     -H 'Authorization: service-accounts API-Key demo-audit-secret-key-change-me' \
  //     -d '{}'
  {
    path: '/audit-content',
    method: 'post',
    custom: {
      description:
        'Run a one-shot content audit via the chat agent. Body: `{ prompt?: string }`. Authenticate with a `service-accounts` API key. Designed to be called from a cron / scheduled job.',
      schema: {
        body: {
          prompt: {
            type: 'string',
            description: 'Optional prompt override. Defaults to the built-in stale-content audit.',
          },
        },
        response: {
          ok: { type: 'boolean' },
          text: { type: 'string' },
          totalTokens: { type: 'number', nullable: true },
        },
      },
    },
    handler: async (req: PayloadRequest) => {
      // Reject anything that isn't a service-account caller. We pin the
      // collection here so a regular `users` session can't accidentally
      // trigger an audit through the same endpoint.
      if (!req.user || req.user.collection !== 'service-accounts') {
        return Response.json(
          {
            error:
              'Unauthorized — provide a service-accounts API key in `Authorization: service-accounts API-Key <key>`',
          },
          { status: 401 },
        )
      }

      const body = ((await req.json?.()) ?? {}) as { prompt?: string }
      const prompt =
        body.prompt ??
        'Audit the `posts` collection: list every post with no `featuredImage`, by title and id, one per line. If they all have an image, say so.'

      // Run as the service account: tool calls inherit its access
      // permissions, no `overrideAccess` needed. `skipBudget: true` keeps
      // automated runs from charging against any per-user cap. The actor
      // (`req.user`) and the Local API (`req.payload`) both ride on `req`.
      const result = await runAgent(req, {
        abortSignal: req.signal,
        maxSteps: 30,
        messages: prompt,
        mode: 'read',
        skipBudget: true,
      })

      const text = await result.text
      const usage = await result.totalUsage

      return Response.json({
        ok: true,
        text,
        totalTokens: usage.totalTokens ?? null,
      })
    },
  },

  {
    path: '/ping',
    method: 'get',
    custom: {
      description:
        'Health check. Returns `{ ok: true, time }` with the server timestamp. Takes no input.',
      schema: {
        response: {
          ok: { type: 'boolean' },
          time: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: () => {
      return Response.json({ ok: true, time: new Date().toISOString() })
    },
  },
  {
    path: '/echo/:message',
    method: 'get',
    custom: {
      description:
        'Echo a message back from a URL path param. Route param `:message` is returned verbatim.',
      schema: {
        response: { message: { type: 'string', nullable: true } },
      },
    },
    handler: (req: PayloadRequest) => {
      return Response.json({ message: req.routeParams?.message ?? null })
    },
  },
  {
    path: '/echo',
    method: 'post',
    custom: {
      description:
        'Echo a JSON body back. Accepts any object and returns `{ received: <body> }`. Useful for verifying body serialization.',
      schema: {
        body: { type: 'object', description: 'Arbitrary JSON object' },
        response: { received: { type: 'object', nullable: true } },
      },
    },
    handler: async (req: PayloadRequest) => {
      const body = await req.json?.()
      return Response.json({ received: body ?? null })
    },
  },
  {
    path: '/search',
    method: 'get',
    custom: {
      description:
        'Demonstrates query-string parsing. Accepts query params `q` (string) and `limit` (number), echoes both back.',
      schema: {
        query: {
          q: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results to return' },
        },
        response: {
          q: { type: 'string', nullable: true },
          limit: { type: 'number', nullable: true },
        },
      },
    },
    handler: (req: PayloadRequest) => {
      const q = req.searchParams?.get('q') ?? null
      const limitRaw = req.searchParams?.get('limit')
      const limit = limitRaw ? Number(limitRaw) : null
      return Response.json({ q, limit })
    },
  },
  {
    path: '/stats',
    method: 'get',
    custom: {
      description:
        'Returns document counts across the seeded collections (`posts`, `categories`, `users`). No input.',
      schema: {
        response: {
          posts: { type: 'number' },
          categories: { type: 'number' },
          users: { type: 'number' },
        },
      },
    },
    handler: async (req: PayloadRequest) => {
      const [posts, categories, users] = await Promise.all([
        req.payload.count({ collection: 'posts' }),
        req.payload.count({ collection: 'categories' }),
        req.payload.count({ collection: 'users' }),
      ])
      return Response.json({
        posts: posts.totalDocs,
        categories: categories.totalDocs,
        users: users.totalDocs,
      })
    },
  },
]

/** Endpoints attached to the `posts` collection (mounted under `/api/posts`). */
export const postsEndpoints: Endpoint[] = [
  {
    path: '/publish/:id',
    method: 'post',
    custom: {
      description:
        "Publish a post by id. Sets its `_status` to `'published'` and returns the updated document. Route param `:id` is the post id.",
      schema: {
        response: {
          id: { type: 'string' },
          _status: { type: 'string', enum: ['draft', 'published'] },
        },
      },
    },
    handler: async (req: PayloadRequest) => {
      const id = req.routeParams?.id as string | undefined
      if (!id) {
        return Response.json({ error: 'Missing id route param' }, { status: 400 })
      }
      const updated = await req.payload.update({
        collection: 'posts',
        id,
        data: { _status: 'published' },
        select: {},
      })
      return Response.json(updated)
    },
  },
]
