import { describe, it, expect, vi } from 'vitest'
import { buildTools, discoverEndpoints } from '../tools.js'

describe('buildTools', () => {
  const mockUser = { id: 'user-1', email: 'admin@test.com' }

  function createMockPayload() {
    return {
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      findByID: vi.fn().mockResolvedValue({ id: '1', title: 'Test' }),
      create: vi.fn().mockResolvedValue({ id: 'new-1', title: 'Created' }),
      update: vi.fn().mockResolvedValue({ id: '1', title: 'Updated' }),
      delete: vi.fn().mockResolvedValue({ id: '1' }),
      count: vi.fn().mockResolvedValue({ totalDocs: 42 }),
      findGlobal: vi.fn().mockResolvedValue({ siteName: 'Test Site' }),
      updateGlobal: vi.fn().mockResolvedValue({ siteName: 'Updated Site' }),
    }
  }

  it('returns 8 tools', () => {
    const tools = buildTools(createMockPayload(), mockUser)
    expect(Object.keys(tools)).toHaveLength(8)
  })

  const expectedTools = [
    'find',
    'findByID',
    'create',
    'update',
    'delete',
    'count',
    'findGlobal',
    'updateGlobal',
  ]

  for (const name of expectedTools) {
    it(`includes "${name}" tool`, () => {
      const tools = buildTools(createMockPayload(), mockUser)
      expect(tools).toHaveProperty(name)
    })
  }

  it('find calls payload.find with correct arguments', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      {
        collection: 'posts',
        where: { status: { equals: 'published' } },
        limit: 5,
        sort: '-createdAt',
        select: { title: true, slug: true },
        depth: 2,
      },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        where: { status: { equals: 'published' } },
        limit: 5,
        page: 1,
        sort: '-createdAt',
        depth: 2,
        select: { title: true, slug: true },
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('defaults depth to 0 when omitted', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.find.execute(
      { collection: 'posts' },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('findByID calls payload.findByID correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.findByID.execute(
      { collection: 'posts', id: 'abc-123', depth: 2 },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        id: 'abc-123',
        depth: 2,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('create calls payload.create correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)
    const data = { title: 'New Post', status: 'draft' }

    await tools.create.execute(
      { collection: 'posts', data, locale: 'en' },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        data,
        locale: 'en',
        depth: 0,
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('update calls payload.update correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.update.execute(
      { collection: 'posts', id: 'abc-123', data: { title: 'Updated' } },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        id: 'abc-123',
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
      { collection: 'posts', id: 'abc-123' },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        id: 'abc-123',
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
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        where: { status: { equals: 'published' } },
        overrideAccess: false,
        user: mockUser,
      }),
    )
  })

  it('findGlobal calls payload.findGlobal correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.findGlobal.execute(
      { slug: 'settings' },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
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
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
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
        select: { title: true, slug: true },
        populate: { author: true },
      },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { title: true, slug: true },
        populate: { author: true },
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
        locale: 'de',
        fallbackLocale: 'en',
      },
      { toolCallId: '1', messages: [], abortSignal: undefined as any },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        locale: 'de',
        fallbackLocale: 'en',
      }),
    )
  })

  it('always passes overrideAccess: false and user', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)
    const ctx = {
      toolCallId: '1',
      messages: [],
      abortSignal: undefined as any,
    }

    await tools.find.execute({ collection: 'posts' }, ctx)
    await tools.findByID.execute({ collection: 'posts', id: '1' }, ctx)
    await tools.create.execute({ collection: 'posts', data: {} }, ctx)
    await tools.update.execute({ collection: 'posts', id: '1', data: {} }, ctx)
    await tools.delete.execute({ collection: 'posts', id: '1' }, ctx)
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
      expect(
        (payload as any)[method],
        `${method} should pass overrideAccess: false`,
      ).toHaveBeenCalledWith(expect.objectContaining({ overrideAccess: false, user: mockUser }))
    }
  })
})

// ---------------------------------------------------------------------------
// discoverEndpoints
// ---------------------------------------------------------------------------

describe('discoverEndpoints', () => {
  it('discovers root-level endpoints with custom.description', () => {
    const config = {
      endpoints: [
        {
          path: '/publish',
          method: 'post',
          handler: () => {},
          custom: { description: 'Publish content' },
        },
        { path: '/no-desc', method: 'get', handler: () => {} },
      ],
      collections: [],
      globals: [],
    }
    const eps = discoverEndpoints(config)
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/publish')
    expect(eps[0].description).toBe('Publish content')
  })

  it('discovers collection-level endpoints', () => {
    const config = {
      endpoints: [],
      collections: [
        {
          slug: 'posts',
          endpoints: [
            {
              path: '/publish/:id',
              method: 'post',
              handler: () => {},
              custom: { description: 'Publish a post' },
            },
          ],
        },
      ],
      globals: [],
    }
    const eps = discoverEndpoints(config)
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/posts/publish/:id')
  })

  it('discovers global-level endpoints', () => {
    const config = {
      endpoints: [],
      collections: [],
      globals: [
        {
          slug: 'settings',
          endpoints: [
            {
              path: '/reset',
              method: 'post',
              handler: () => {},
              custom: { description: 'Reset settings' },
            },
          ],
        },
      ],
    }
    const eps = discoverEndpoints(config)
    expect(eps).toHaveLength(1)
    expect(eps[0].path).toBe('/api/globals/settings/reset')
  })

  it('skips chat-agent endpoints', () => {
    const config = {
      endpoints: [
        {
          path: '/chat-agent/chat',
          method: 'post',
          handler: () => {},
          custom: { description: 'Chat endpoint' },
        },
      ],
      collections: [],
      globals: [],
    }
    const eps = discoverEndpoints(config)
    expect(eps).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// callEndpoint tool
// ---------------------------------------------------------------------------

describe('callEndpoint tool', () => {
  const mockPayload = {
    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    findGlobal: vi.fn(),
    updateGlobal: vi.fn(),
  }
  const mockUser = { id: 'u1' }
  const ctx = {
    toolCallId: '1',
    messages: [],
    abortSignal: undefined as any,
  }

  it('is not included when no custom endpoints', () => {
    const tools = buildTools(mockPayload, mockUser)
    expect(tools.callEndpoint).toBeUndefined()
  })

  it('is not included when custom endpoints is empty', () => {
    const tools = buildTools(mockPayload, mockUser, false, {}, [])
    expect(tools.callEndpoint).toBeUndefined()
  })

  it('is included when custom endpoints exist and req is provided', () => {
    const endpoints = [
      {
        path: '/api/publish',
        method: 'post',
        handler: () => Response.json({ ok: true }),
        description: 'Publish',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)
    expect(tools.callEndpoint).toBeDefined()
    expect(tools.callEndpoint.description).toContain('custom API endpoint')
  })

  it('calls the matching handler with route params', async () => {
    const handler = vi.fn(async (req: any) => {
      return Response.json({
        id: req.routeParams.id,
        published: true,
      })
    })
    const endpoints = [
      {
        path: '/api/posts/publish/:id',
        method: 'post',
        handler,
        description: 'Publish a post',
      },
    ]
    const mockReq = { payload: mockPayload, user: mockUser }
    const tools = buildTools(mockPayload, mockUser, false, mockReq, endpoints)

    const result = await tools.callEndpoint.execute(
      {
        path: '/api/posts/publish/abc123',
        method: 'post',
        body: { draft: false },
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
        path: '/api/publish',
        method: 'post',
        handler: () => Response.json({}),
        description: 'Publish',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)

    const result = await tools.callEndpoint.execute({ path: '/api/unknown', method: 'get' }, ctx)

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('No custom endpoint'),
      }),
    )
  })

  it('handles handler errors gracefully', async () => {
    const endpoints = [
      {
        path: '/api/fail',
        method: 'post',
        handler: () => {
          throw new Error('handler crashed')
        },
        description: 'Failing endpoint',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)

    const result = await tools.callEndpoint.execute({ path: '/api/fail', method: 'post' }, ctx)

    expect(result).toEqual(expect.objectContaining({ error: 'handler crashed' }))
  })
})
