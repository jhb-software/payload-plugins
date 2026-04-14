import type { Endpoint, PayloadRequest } from 'payload'

/** Root-level endpoints (mounted under `/api`). */
export const rootEndpoints: Endpoint[] = [
  {
    path: '/ping',
    method: 'get',
    custom: {
      description:
        'Health check. Returns `{ ok: true, time }` with the server timestamp. Takes no input.',
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
        "Publish a post by id. Sets its `status` to `'published'` and returns the updated document. Route param `:id` is the post id.",
    },
    handler: async (req: PayloadRequest) => {
      const id = req.routeParams?.id as string | undefined
      if (!id) {
        return Response.json({ error: 'Missing id route param' }, { status: 400 })
      }
      const updated = await req.payload.update({
        collection: 'posts',
        id,
        data: { status: 'published' },
      })
      return Response.json(updated)
    },
  },
]
