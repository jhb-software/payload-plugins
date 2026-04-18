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

  it('exposes listBlocks and getBlockSchema when config is passed', () => {
    // Same contract-lock as the base set, but for the config-gated surface.
    // The schema inspection tools register together; if any of them is
    // dropped or renamed, lock it here so the agent doesn't silently lose a
    // discovery path.
    const tools = buildTools(createMockPayload(), mockUser, false, undefined, undefined, {
      collections: [],
      globals: [],
    })
    expect(Object.keys(tools).sort()).toEqual([
      'count',
      'create',
      'delete',
      'find',
      'findByID',
      'findGlobal',
      'getBlockSchema',
      'getCollectionSchema',
      'getGlobalSchema',
      'listBlocks',
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
      // Only iterate over read tools that were actually registered — some
      // read tools (schema inspection, listEndpoints) only register when
      // their prerequisites (config, endpoints) are passed to buildTools.
      for (const name of READ_TOOL_NAMES) {
        if (!(name in tools)) {
          continue
        }
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

  describe('user-defined tools (unknown names)', () => {
    // Tools registered via `chatAgentPlugin({ customTools })` don't appear in
    // the built-in read/write name lists. The filter treats unknown names as
    // writes — the safe default, since we can't know their side effects.

    const customTool = {
      description: 'Ships packages',
      execute: vi.fn(),
      inputSchema: {},
    } as unknown as Parameters<typeof filterToolsByMode>[0][string]

    function filterWithCustom(mode: 'ask' | 'read' | 'read-write') {
      const tools = { ...buildTools(mockPayload, mockUser), shipPackage: customTool }
      return filterToolsByMode(tools, mode)
    }

    it('excludes unknown tools in read mode', () => {
      expect(Object.keys(filterWithCustom('read'))).not.toContain('shipPackage')
    })

    it('marks unknown tools with needsApproval: true in ask mode', () => {
      const filtered = filterWithCustom('ask')
      expect(filtered.shipPackage).toBeDefined()
      expect((filtered.shipPackage as { needsApproval?: boolean }).needsApproval).toBe(true)
    })

    it('allows an unknown tool without approval in read-write mode', () => {
      expect(filterWithCustom('read-write').shipPackage).toBe(customTool)
    })
  })
})

// ---------------------------------------------------------------------------
// Schema inspection tools (getCollectionSchema, getGlobalSchema)
// ---------------------------------------------------------------------------

describe('schema inspection tools', () => {
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
  const ctx = { abortSignal: undefined, messages: [], toolCallId: '1' }

  it('are not registered when config is not passed', () => {
    const tools = buildTools(mockPayload, mockUser)
    expect(tools.getCollectionSchema).toBeUndefined()
    expect(tools.getGlobalSchema).toBeUndefined()
  })

  it('are registered when config is passed', () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [],
      globals: [],
    })
    expect(tools.getCollectionSchema).toBeDefined()
    expect(tools.getGlobalSchema).toBeDefined()
  })

  it('getCollectionSchema returns extracted fields for a known slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [
        {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'body', type: 'richText' },
          ],
        },
      ],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'posts' }, ctx)) as {
      fields: { name: string; required?: boolean; type: string }[]
      upload: boolean
    }

    expect(result.fields).toEqual([
      { name: 'title', type: 'text', required: true },
      { name: 'body', type: 'richText' },
    ])
    expect(result.upload).toBe(false)
  })

  it('getCollectionSchema returns upload: true for upload-enabled collections', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [{ slug: 'media', fields: [{ name: 'alt', type: 'text' }], upload: true }],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'media' }, ctx)) as {
      upload: boolean
    }
    expect(result.upload).toBe(true)
  })

  it('getCollectionSchema returns error (not throw) for unknown slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [{ slug: 'posts', fields: [] }],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'does-not-exist' }, ctx)) as {
      error: string
    }
    expect(result.error).toMatch(/unknown collection slug/i)
    expect(result.error).toContain('does-not-exist')
  })

  it('getCollectionSchema resolves blockReferences from config.blocks', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'cta',
          fields: [{ name: 'buttonText', type: 'text' }],
        },
      ],
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blockReferences: ['cta'],
              blocks: [],
            },
          ],
        },
      ],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'pages' }, ctx)) as {
      fields: unknown[]
    }
    expect(JSON.stringify(result.fields)).toContain('buttonText')
  })

  it('getCollectionSchema surfaces inline blocks declared on the field', async () => {
    // Inline blocks live on `field.blocks` — they never appear in
    // config.blocks, so the only way the agent can learn their shape is
    // through the parent collection's schema.
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [
                {
                  slug: 'inlineHero',
                  fields: [{ name: 'headline', type: 'text', required: true }],
                },
              ],
            },
          ],
        },
      ],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'pages' }, ctx)) as {
      fields: { blocks?: { fields: { name: string }[]; slug: string }[]; name: string }[]
    }
    const layout = result.fields.find((f) => f.name === 'layout')!
    expect(layout.blocks).toEqual([
      {
        slug: 'inlineHero',
        fields: [{ name: 'headline', required: true, type: 'text' }],
      },
    ])
  })

  it('getCollectionSchema merges inline blocks and blockReferences on the same field', async () => {
    // Payload allows a single `blocks` field to declare inline blocks AND
    // reference globally-registered blocks by slug. Both should appear in
    // the extracted schema so the agent knows every block it may insert.
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'globalCta',
          fields: [{ name: 'buttonText', type: 'text' }],
        },
      ],
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blockReferences: ['globalCta'],
              blocks: [
                {
                  slug: 'inlineHero',
                  fields: [{ name: 'headline', type: 'text' }],
                },
              ],
            },
          ],
        },
      ],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'pages' }, ctx)) as {
      fields: { blocks?: { slug: string }[]; name: string }[]
    }
    const layout = result.fields.find((f) => f.name === 'layout')!
    expect(layout.blocks?.map((b) => b.slug)).toEqual(['inlineHero', 'globalCta'])
  })

  it('getGlobalSchema returns extracted fields for a known slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [],
      globals: [{ slug: 'settings', fields: [{ name: 'siteName', type: 'text' }] }],
    })

    const result = (await tools.getGlobalSchema.execute({ slug: 'settings' }, ctx)) as {
      fields: { name: string; type: string }[]
    }
    expect(result.fields).toEqual([{ name: 'siteName', type: 'text' }])
  })

  it('getCollectionSchema normalizes all shapes of select option labels', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [
        {
          slug: 'places',
          fields: [
            {
              name: 'type',
              type: 'select',
              options: [
                'plainString',
                { label: 'Hotel', value: 'hotel' },
                { label: { de: 'Sonstige', en: 'Other' }, value: 'other' },
                { label: ({ t }: { t: (k: string) => string }) => t('hostel'), value: 'hostel' },
                { label: false, value: 'camping' },
              ],
            },
          ],
        },
      ],
      globals: [],
    })

    const result = (await tools.getCollectionSchema.execute({ slug: 'places' }, ctx)) as {
      fields: { options?: { label?: unknown; value: string }[] }[]
    }
    const typeField = result.fields.find((f) => (f as { name: string }).name === 'type')!
    expect(typeField.options).toEqual([
      { label: 'plainString', value: 'plainString' },
      { label: 'Hotel', value: 'hotel' },
      { label: { de: 'Sonstige', en: 'Other' }, value: 'other' },
      { value: 'hostel' },
      { value: 'camping' },
    ])
  })

  it('getGlobalSchema returns error for unknown slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [],
      globals: [{ slug: 'settings', fields: [] }],
    })

    const result = (await tools.getGlobalSchema.execute({ slug: 'missing' }, ctx)) as {
      error: string
    }
    expect(result.error).toMatch(/unknown global slug/i)
  })
})

// ---------------------------------------------------------------------------
// Block schema tools (listBlocks, getBlockSchema)
// ---------------------------------------------------------------------------

describe('block schema tools', () => {
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
  const ctx = { abortSignal: undefined, messages: [], toolCallId: '1' }

  it('are not registered when config is not passed', () => {
    const tools = buildTools(mockPayload, mockUser)
    expect(tools.listBlocks).toBeUndefined()
    expect(tools.getBlockSchema).toBeUndefined()
  })

  it('listBlocks returns slugs from config.blocks in declared order', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        { slug: 'hero', fields: [] },
        { slug: 'callToAction', fields: [] },
      ],
      collections: [],
      globals: [],
    })

    const result = (await tools.listBlocks.execute({}, ctx)) as {
      blocks: { slug: string }[]
    }
    expect(result.blocks.map((b) => b.slug)).toEqual(['hero', 'callToAction'])
  })

  it('listBlocks surfaces normalized labels and interfaceName when set', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'hero',
          fields: [],
          interfaceName: 'HeroBlock',
          labels: { plural: 'Heroes', singular: 'Hero' },
        },
      ],
      collections: [],
      globals: [],
    })

    const result = (await tools.listBlocks.execute({}, ctx)) as {
      blocks: { interfaceName?: string; labels?: { plural?: unknown; singular?: unknown }; slug: string }[]
    }
    expect(result.blocks).toEqual([
      {
        slug: 'hero',
        interfaceName: 'HeroBlock',
        labels: { plural: 'Heroes', singular: 'Hero' },
      },
    ])
  })

  it('listBlocks omits labels when both leaves normalize to undefined', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [{ slug: 'hero', fields: [], labels: { singular: () => 'X' } }],
      collections: [],
      globals: [],
    })

    const result = (await tools.listBlocks.execute({}, ctx)) as {
      blocks: Record<string, unknown>[]
    }
    expect(result.blocks).toEqual([{ slug: 'hero' }])
    expect(result.blocks[0]).not.toHaveProperty('labels')
  })

  it('listBlocks returns an empty array when config.blocks is absent or empty', async () => {
    const noBlocks = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      collections: [],
      globals: [],
    })
    expect(((await noBlocks.listBlocks.execute({}, ctx)) as { blocks: unknown[] }).blocks).toEqual(
      [],
    )

    const emptyBlocks = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [],
      collections: [],
      globals: [],
    })
    expect(
      ((await emptyBlocks.listBlocks.execute({}, ctx)) as { blocks: unknown[] }).blocks,
    ).toEqual([])
  })

  it('getBlockSchema returns fields for a known slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'hero',
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'subheading', type: 'text' },
          ],
        },
      ],
      collections: [],
      globals: [],
    })

    const result = (await tools.getBlockSchema.execute({ slug: 'hero' }, ctx)) as {
      fields: { name: string }[]
      slug: string
    }
    expect(result.slug).toBe('hero')
    expect(result.fields.map((f) => f.name)).toEqual(['heading', 'subheading'])
  })

  it('getBlockSchema returns { error } for an unknown slug', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [{ slug: 'hero', fields: [] }],
      collections: [],
      globals: [],
    })

    const result = (await tools.getBlockSchema.execute({ slug: 'nope' }, ctx)) as {
      error: string
    }
    expect(result.error).toBe('Unknown block slug "nope"')
  })

  it('getBlockSchema resolves nested blockReferences', async () => {
    // Block A contains a `blocks` field that references block B by slug.
    // The shared blocksBySlug map must let extractFields follow that ref
    // transparently — same mechanism getCollectionSchema uses.
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'parent',
          fields: [
            {
              name: 'children',
              type: 'blocks',
              blockReferences: ['child'],
              blocks: [],
            },
          ],
        },
        { slug: 'child', fields: [{ name: 'label', type: 'text' }] },
      ],
      collections: [],
      globals: [],
    })

    const result = (await tools.getBlockSchema.execute({ slug: 'parent' }, ctx)) as {
      fields: unknown[]
    }
    expect(JSON.stringify(result.fields)).toContain('label')
  })

  it('getBlockSchema surfaces labels and interfaceName when set', async () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [
        {
          slug: 'hero',
          fields: [],
          interfaceName: 'HeroBlock',
          labels: { plural: 'Heroes', singular: 'Hero' },
        },
      ],
      collections: [],
      globals: [],
    })

    const result = (await tools.getBlockSchema.execute({ slug: 'hero' }, ctx)) as {
      interfaceName?: string
      labels?: { plural?: unknown; singular?: unknown }
    }
    expect(result.interfaceName).toBe('HeroBlock')
    expect(result.labels).toEqual({ plural: 'Heroes', singular: 'Hero' })
  })

  it('read and ask mode filters keep both block tools', () => {
    const tools = buildTools(mockPayload, mockUser, false, undefined, undefined, {
      blocks: [{ slug: 'hero', fields: [] }],
      collections: [],
      globals: [],
    })

    const readTools = filterToolsByMode(tools, 'read')
    expect(readTools).toHaveProperty('listBlocks')
    expect(readTools).toHaveProperty('getBlockSchema')

    const askTools = filterToolsByMode(tools, 'ask')
    expect(askTools).toHaveProperty('listBlocks')
    expect(askTools).toHaveProperty('getBlockSchema')
    // Read tools stay plain in ask mode — no needsApproval gate.
    expect(askTools.listBlocks).not.toHaveProperty('needsApproval')
    expect(askTools.getBlockSchema).not.toHaveProperty('needsApproval')
  })
})

// ---------------------------------------------------------------------------
// listEndpoints tool
// ---------------------------------------------------------------------------

describe('listEndpoints', () => {
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
  const ctx = { abortSignal: undefined, messages: [], toolCallId: '1' }

  it('is not registered when no custom endpoints exist', () => {
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), [])
    expect(tools.listEndpoints).toBeUndefined()
  })

  it('returns method, path, and description for each endpoint', async () => {
    const endpoints = [
      {
        description: 'Publish a post',
        handler: () => Response.json({}),
        method: 'post',
        path: '/api/posts/publish/:id',
      },
      {
        description: 'Archive a post',
        handler: () => Response.json({}),
        method: 'delete',
        path: '/api/posts/archive/:id',
      },
    ]
    const tools = buildTools(mockPayload, mockUser, false, asReq({}), endpoints)

    const result = (await tools.listEndpoints.execute({}, ctx)) as {
      endpoints: { description?: string; method: string; path: string }[]
    }
    expect(result.endpoints).toEqual([
      { description: 'Publish a post', method: 'POST', path: '/api/posts/publish/:id' },
      { description: 'Archive a post', method: 'DELETE', path: '/api/posts/archive/:id' },
    ])
  })
})
