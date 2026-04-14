import type { PayloadRequest, SanitizedConfig } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  buildTools,
  discoverEndpoints,
  filterToolsByMode,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from './tools.js'

/**
 * Cast helpers for test mocks.
 *
 * `discoverEndpoints` and `buildTools` take strict Payload types
 * (`SanitizedConfig`, `PayloadRequest`) that have 17+ required fields. Tests
 * only exercise a handful of those fields, so supplying the full shape per
 * test would be noise. These helpers document that the cast is deliberate
 * — the mock is intentionally partial.
 */
const asConfig = (v: unknown) => v as SanitizedConfig
const asReq = (v: unknown) => v as PayloadRequest

describe('buildTools', () => {
  const mockUser = { id: 'user-1', email: 'admin@test.com' }

  function createMockPayload() {
    return {
      count: vi.fn().mockResolvedValue({ totalDocs: 42 }),
      create: vi.fn().mockResolvedValue({ id: 'new-1', title: 'Created' }),
      delete: vi.fn().mockResolvedValue({ id: '1' }),
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      findByID: vi.fn().mockResolvedValue({ id: '1', title: 'Test' }),
      findGlobal: vi.fn().mockResolvedValue({ siteName: 'Test Site' }),
      update: vi.fn().mockResolvedValue({ id: '1', title: 'Updated' }),
      updateGlobal: vi.fn().mockResolvedValue({ siteName: 'Updated Site' }),
    }
  }

  it('exposes exactly the core CRUD + global tools (no stray additions)', () => {
    // If a future refactor drops or renames one of these, every mode filter +
    // every agent prompt that references the removed name silently regresses.
    // Lock the contract in one place.
    const tools = buildTools(createMockPayload(), mockUser)
    expect(Object.keys(tools).sort()).toEqual([
      'count',
      'create',
      'delete',
      'find',
      'findByID',
      'findGlobal',
      'update',
      'updateGlobal',
    ])
  })

  it('find calls payload.find with correct arguments', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      {
        collection: 'posts',
        depth: 2,
        limit: 5,
        select: { slug: true, title: true },
        sort: '-createdAt',
        where: { status: { equals: 'published' } },
      },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        depth: 2,
        limit: 5,
        overrideAccess: false,
        page: 1,
        select: { slug: true, title: true },
        sort: '-createdAt',
        user: mockUser,
        where: { status: { equals: 'published' } },
      }),
    )
  })

  it('defaults depth to 0 when omitted', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      { collection: 'posts' },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('findByID calls payload.findByID correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.findByID.execute(
      { id: 'abc-123', collection: 'posts', depth: 2 },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'abc-123',
        collection: 'posts',
        depth: 2,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('create calls payload.create correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)
    const data = { status: 'draft', title: 'New Post' }

    await tools.create.execute(
      { collection: 'posts', data, locale: 'en' },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        data,
        depth: 0,
        locale: 'en',
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('update calls payload.update correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.update.execute(
      { id: 'abc-123', collection: 'posts', data: { title: 'Updated' } },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'abc-123',
        collection: 'posts',
        data: { title: 'Updated' },
        depth: 0,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('delete calls payload.delete correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.delete.execute(
      { id: 'abc-123', collection: 'posts' },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'abc-123',
        collection: 'posts',
        depth: 0,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('count calls payload.count correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.count.execute(
      { collection: 'posts', where: { status: { equals: 'published' } } },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        overrideAccess: false,
        user: mockUser,
        where: { status: { equals: 'published' } },
      }),
    )
  })

  it('findGlobal calls payload.findGlobal correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.findGlobal.execute(
      { slug: 'settings' },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'settings',
        depth: 0,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('updateGlobal calls payload.updateGlobal correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.updateGlobal.execute(
      { slug: 'settings', data: { siteName: 'New Name' } },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.updateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'settings',
        data: { siteName: 'New Name' },
        depth: 0,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('passes select and populate when provided', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      {
        collection: 'posts',
        populate: { author: true },
        select: { slug: true, title: true },
      },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        populate: { author: true },
        select: { slug: true, title: true },
      }),
    )
  })

  it('passes draft and fallbackLocale when provided', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      {
        collection: 'posts',
        draft: true,
        fallbackLocale: 'en',
        locale: 'de',
      },
      { abortSignal: undefined, messages: [], toolCallId: '1' },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        fallbackLocale: 'en',
        locale: 'de',
      }),
    )
  })

  it('always passes overrideAccess: false and user', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)
    const ctx = {
      abortSignal: undefined,
      messages: [],
      toolCallId: '1',
    }

    await tools.find.execute({ collection: 'posts' }, ctx)
    await tools.findByID.execute({ id: '1', collection: 'posts' }, ctx)
    await tools.create.execute({ collection: 'posts', data: {} }, ctx)
    await tools.update.execute({ id: '1', collection: 'posts', data: {} }, ctx)
    await tools.delete.execute({ id: '1', collection: 'posts' }, ctx)
    await tools.count.execute({ collection: 'posts' }, ctx)
    await tools.findGlobal.execute({ slug: 'settings' }, ctx)
    await tools.updateGlobal.execute({ slug: 'settings', data: {} }, ctx)

    for (const method of [
      'find',
      'findByID',
      'create',
      'update',
      'delete',
      'count',
      'findGlobal',
      'updateGlobal',
    ] as const) {
      expect(payload[method], `${method} should pass overrideAccess: false`).toHaveBeenCalledWith(
        expect.objectContaining({ overrideAccess: false, user: mockUser }),
      )
    }
  })
})

// ---------------------------------------------------------------------------
// discoverEndpoints
// ---------------------------------------------------------------------------

describe('discoverEndpoints', () => {
  it('discovers root-level endpoints with custom.description', () => {
    const config = {
      collections: [],
      endpoints: [
        {
          custom: { description: 'Publish content' },
          handler: () => {},
          method: 'post',
          path: '/publish',
        },
        { handler: () => {}, method: 'get', path: '/no-desc' },
      ],
      globals: [],
    }
    const eps = discoverEndpoints(asConfig(config))
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/publish')
    expect(eps[0].description).toBe('Publish content')
  })

  it('discovers collection-level endpoints', () => {
    const config = {
      collections: [
        {
          slug: 'posts',
          endpoints: [
            {
              custom: { description: 'Publish a post' },
              handler: () => {},
              method: 'post',
              path: '/publish/:id',
            },
          ],
        },
      ],
      endpoints: [],
      globals: [],
    }
    const eps = discoverEndpoints(asConfig(config))
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/posts/publish/:id')
  })

  it('discovers global-level endpoints', () => {
    const config = {
      collections: [],
      endpoints: [],
      globals: [
        {
          slug: 'settings',
          endpoints: [
            {
              custom: { description: 'Reset settings' },
              handler: () => {},
              method: 'post',
              path: '/reset',
            },
          ],
        },
      ],
    }
    const eps = discoverEndpoints(asConfig(config))
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/globals/settings/reset')
  })

  it('skips chat-agent endpoints', () => {
    const config = {
      collections: [],
      endpoints: [
        {
          custom: { description: 'Chat endpoint' },
          handler: () => {},
          method: 'post',
          path: '/chat-agent/chat',
        },
      ],
      globals: [],
    }
    const eps = discoverEndpoints(asConfig(config))
    expect(eps).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// callEndpoint tool
// ---------------------------------------------------------------------------

describe('callEndpoint tool', () => {
  const mockPayload = {
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    findByID: vi.fn(),
    findGlobal: vi.fn(),
    update: vi.fn(),
    updateGlobal: vi.fn(),
  }
  const mockUser = { id: 'u1' }
  const ctx = {
    abortSignal: undefined,
    messages: [],
    toolCallId: '1',
  }

  it('is not included when there are no custom endpoints to wrap', () => {
    // Omitted entirely and empty array both mean the same thing: no extra
    // tool surface should be exposed to the model.
    expect(buildTools(mockPayload, mockUser).callEndpoint).toBeUndefined()
    expect(buildTools(mockPayload, mockUser, false, asReq({}), []).callEndpoint).toBeUndefined()
  })

  it('is included when custom endpoints exist and req is provided', () => {
    const endpoints = [
      {
        description: 'Publish',
        handler: () => Response.json({ ok: true }),
        method: 'post',
        path: '/api/publish',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)
    expect(tools.callEndpoint).toBeDefined()
    expect(tools.callEndpoint.description).toContain('custom API endpoint')
  })

  it('calls the matching handler with route params', async () => {
    const handler = vi.fn((req: PayloadRequest) => {
      return Response.json({
        id: (req.routeParams as { id: string }).id,
        published: true,
      })
    })
    const endpoints = [
      {
        description: 'Publish a post',
        handler,
        method: 'post',
        path: '/api/posts/publish/:id',
      },
    ]
    const mockReq = asReq({ payload: mockPayload, user: mockUser })
    const tools = buildTools(mockPayload, mockUser, false, mockReq, endpoints)

    const result = await tools.callEndpoint.execute(
      {
        body: { draft: false },
        method: 'post',
        path: '/api/posts/publish/abc123',
      },
      ctx,
    )

    expect(handler).toHaveBeenCalledTimes(1)
    const calledReq = handler.mock.calls[0][0]
    expect(calledReq.routeParams).toEqual({ id: 'abc123' })
    expect(result).toEqual({ id: 'abc123', published: true })
  })

  it('returns error for unmatched endpoint', async () => {
    const endpoints = [
      {
        description: 'Publish',
        handler: () => Response.json({}),
        method: 'post',
        path: '/api/publish',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)

    const result = await tools.callEndpoint.execute({ method: 'get', path: '/api/unknown' }, ctx)

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('No custom endpoint'),
      }),
    )
  })

  it('handles handler errors gracefully', async () => {
    const endpoints = [
      {
        description: 'Failing endpoint',
        handler: () => {
          throw new Error('handler crashed')
        },
        method: 'post',
        path: '/api/fail',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)

    const result = await tools.callEndpoint.execute({ method: 'post', path: '/api/fail' }, ctx)

    expect(result).toEqual(expect.objectContaining({ error: 'handler crashed' }))
  })

  // The forged request is built with `Object.create(originalReq)`, so any
  // per-request field the tool doesn't explicitly reset would leak through
  // the prototype chain. The chat endpoint's own `?foo=bar` arriving on the
  // POST would otherwise be visible to a custom handler that expected its
  // own query — so the tool must hand the handler an empty `searchParams`
  // when the agent doesn't pass a `query` input.
  it('does not leak the chat endpoint searchParams through the prototype chain', async () => {
    let capturedSearchParams: undefined | URLSearchParams
    const endpoints = [
      {
        description: 'Capture query',
        handler: (req: PayloadRequest) => {
          capturedSearchParams = req.searchParams
          return Response.json({ ok: true })
        },
        method: 'get',
        path: '/api/ep',
      },
    ]
    const originalSearchParams = new URLSearchParams({ chatSecret: 'leak-me' })
    const mockReq = asReq({ searchParams: originalSearchParams })
    const tools = buildTools(mockPayload, mockUser, false, mockReq, endpoints)

    await tools.callEndpoint.execute({ method: 'get', path: '/api/ep' }, ctx)

    expect(capturedSearchParams).toBeDefined()
    expect(capturedSearchParams!.get('chatSecret')).toBeNull()
  })

  it('passes the agent-supplied query as searchParams', async () => {
    let capturedSearchParams: undefined | URLSearchParams
    const endpoints = [
      {
        description: 'Capture query',
        handler: (req: PayloadRequest) => {
          capturedSearchParams = req.searchParams
          return Response.json({ ok: true })
        },
        method: 'get',
        path: '/api/ep',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)

    await tools.callEndpoint.execute(
      { method: 'get', path: '/api/ep', query: { status: 'published' } },
      ctx,
    )

    expect(capturedSearchParams?.get('status')).toBe('published')
  })
})

// ---------------------------------------------------------------------------
// filterToolsByMode
// ---------------------------------------------------------------------------

describe('filterToolsByMode', () => {
  const mockPayload = {
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    findByID: vi.fn(),
    findGlobal: vi.fn(),
    update: vi.fn(),
    updateGlobal: vi.fn(),
  }
  const mockUser = { id: 'u1' }

  function getAllTools() {
    return buildTools(mockPayload, mockUser)
  }

  describe('read mode', () => {
    it('only includes read tools', () => {
      const tools = getAllTools()
      const filtered = filterToolsByMode(tools, 'read')
      const names = Object.keys(filtered)
      expect(names).toEqual(expect.arrayContaining(['find', 'findByID', 'count', 'findGlobal']))
      expect(names).not.toContain('create')
      expect(names).not.toContain('update')
      expect(names).not.toContain('delete')
      expect(names).not.toContain('updateGlobal')
    })

    it('excludes callEndpoint', () => {
      const endpoints = [
        {
          description: 'Test',
          handler: () => Response.json({}),
          method: 'post',
          path: '/api/test',
        },
      ]
      const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)
      const filtered = filterToolsByMode(tools, 'read')
      expect(Object.keys(filtered)).not.toContain('callEndpoint')
    })
  })

  describe('ask mode', () => {
    it('includes all tools', () => {
      const tools = getAllTools()
      const filtered = filterToolsByMode(tools, 'ask')
      expect(Object.keys(filtered)).toHaveLength(8)
    })

    it('read tools are unchanged (no needsApproval, still have execute)', () => {
      const tools = getAllTools()
      const filtered = filterToolsByMode(tools, 'ask')
      for (const name of READ_TOOL_NAMES) {
        expect(filtered[name]).toHaveProperty('execute')
        expect(filtered[name]).not.toHaveProperty('needsApproval')
      }
    })

    it('write tools keep execute but gain needsApproval: true', () => {
      const tools = getAllTools()
      const filtered = filterToolsByMode(tools, 'ask')
      for (const name of WRITE_TOOL_NAMES) {
        expect(filtered[name]).toHaveProperty('execute')
        expect((filtered[name] as { needsApproval?: boolean }).needsApproval).toBe(true)
      }
    })

    it('marks callEndpoint with needsApproval: true', () => {
      const endpoints = [
        {
          description: 'Test',
          handler: () => Response.json({}),
          method: 'post',
          path: '/api/test',
        },
      ]
      const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)
      const filtered = filterToolsByMode(tools, 'ask')
      expect(filtered.callEndpoint).toBeDefined()
      expect(filtered.callEndpoint).toHaveProperty('execute')
      expect((filtered.callEndpoint as { needsApproval?: boolean }).needsApproval).toBe(true)
    })
  })

  describe('read-write and superuser modes', () => {
    it.each(['read-write', 'superuser'] as const)(
      '%s mode does not add needsApproval to any tool',
      (mode) => {
        // Unlike `ask` mode, these two modes should let every tool execute
        // without confirmation. Check the observable invariant rather than
        // reference equality — the former would pass even if the filter
        // were rewritten to clone-and-return, which we don't care about.
        const filtered = filterToolsByMode(getAllTools(), mode)
        expect(Object.keys(filtered).sort()).toEqual([
          'count',
          'create',
          'delete',
          'find',
          'findByID',
          'findGlobal',
          'update',
          'updateGlobal',
        ])
        for (const tool of Object.values(filtered)) {
          expect(tool).not.toHaveProperty('needsApproval')
        }
      },
    )
  })
})
