import { describe, expect, it, vi } from 'vitest'

import { buildTools, discoverEndpoints } from '../tools.js'

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
        depth: 2,
        limit: 5,
        select: { slug: true, title: true },
        sort: '-createdAt',
        where: { status: { equals: 'published' } },
      },
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
    )

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('findByID calls payload.findByID correctly', async () => {
    const payload = createMockPayload()
    const tools = buildTools(payload, mockUser)

    await tools.findByID.execute(
      { id: 'abc-123', collection: 'posts', depth: 2 },
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      { abortSignal: undefined as any, messages: [], toolCallId: '1' },
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
      abortSignal: undefined as any,
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
    const eps = discoverEndpoints(config)
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
    const eps = discoverEndpoints(config)
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
    const eps = discoverEndpoints(config)
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
    const eps = discoverEndpoints(config)
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
    abortSignal: undefined as any,
    messages: [],
    toolCallId: '1',
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
        description: 'Publish',
        handler: () => Response.json({ ok: true }),
        method: 'post',
        path: '/api/publish',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)
    expect(tools.callEndpoint).toBeDefined()
    expect(tools.callEndpoint.description).toContain('custom API endpoint')
  })

  it('calls the matching handler with route params', async () => {
    const handler = vi.fn((req: any) => {
      return Response.json({
        id: req.routeParams.id,
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
    const mockReq = { payload: mockPayload, user: mockUser }
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
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)

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
    const tools = buildTools(mockPayload, mockUser, false, {}, endpoints)

    const result = await tools.callEndpoint.execute({ method: 'post', path: '/api/fail' }, ctx)

    expect(result).toEqual(expect.objectContaining({ error: 'handler crashed' }))
  })
})
