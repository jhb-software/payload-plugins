import type { MockInstance } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { getDeploymentsEndpoint } from './getDeployments.js'
import { triggerDeploymentEndpoint } from './triggerDeployment.js'

const mockPluginConfig: VercelDeploymentsPluginConfig = {
  vercel: {
    apiToken: 'test-token',
    projectId: 'test-project',
    teamId: 'test-team',
  },
}

function createMockReq(overrides: {
  headers?: Headers
  pluginConfig?: null | VercelDeploymentsPluginConfig
  url?: string
  user?: { id: string } | null
}) {
  return {
    headers: overrides.headers ?? new Headers(),
    json: vi.fn(),
    payload: {
      config: {
        custom: {
          vercelDeploymentsPluginConfig:
            overrides.pluginConfig === null
              ? undefined
              : (overrides.pluginConfig ?? mockPluginConfig),
        },
      },
    },
    url: overrides.url ?? 'http://localhost:3000/api/vercel-deployments',
    user: overrides.user ?? null,
  } as any
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** The Vercel API URLs the endpoint requested, in call order. */
const requestedUrls = (fetchSpy: MockInstance<typeof fetch>) =>
  fetchSpy.mock.calls.map(([input]) => new URL(input as string).toString())

/** The JSON body the endpoint sent with the given Vercel API call. */
const requestedBody = (fetchSpy: MockInstance<typeof fetch>, index: number) =>
  JSON.parse(fetchSpy.mock.calls[index]?.[1]?.body as string) as Record<string, unknown>

describe('getDeploymentsEndpoint', () => {
  it('returns 401 when user is not authenticated (default access)', async () => {
    const req = createMockReq({ user: null })
    const response = await getDeploymentsEndpoint(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when custom access function denies access', async () => {
    const req = createMockReq({
      pluginConfig: { ...mockPluginConfig, access: () => false },
      user: { id: 'user-1' },
    })
    const response = await getDeploymentsEndpoint(req)
    expect(response.status).toBe(401)
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ pluginConfig: null, user: { id: 'user-1' } })
    const response = await getDeploymentsEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })

  it('rejects an id containing path separators without contacting the Vercel API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const req = createMockReq({
      url: 'http://localhost:3000/api/vercel-deployments?id=..%2F..%2Fv9%2Fprojects',
      user: { id: 'user-1' },
    })

    const response = await getDeploymentsEndpoint(req)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid deployment id')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lists deployments of the project resolved for the request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ deployments: [], pagination: { count: 0 } }))
    const req = createMockReq({
      headers: new Headers({ 'x-tenant': 'acme' }),
      pluginConfig: {
        vercel: {
          apiToken: 'test-token',
          projectId: ({ req }) => `prj_${req.headers.get('x-tenant')}`,
        },
      },
      user: { id: 'user-1' },
    })

    const response = await getDeploymentsEndpoint(req)

    expect(response.status).toBe(200)
    expect(requestedUrls(fetchSpy)[0]).toContain('projectId=prj_acme')
  })

  it('returns 400 without contacting Vercel when no project resolves for the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const req = createMockReq({
      pluginConfig: { vercel: { apiToken: 'test-token', projectId: () => undefined } },
      user: { id: 'user-1' },
    })

    const response = await getDeploymentsEndpoint(req)

    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('triggerDeploymentEndpoint', () => {
  it('returns 401 when user is not authenticated (default access)', async () => {
    const req = createMockReq({ user: null })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when custom access function denies access', async () => {
    const req = createMockReq({
      pluginConfig: { ...mockPluginConfig, access: () => false },
      user: { id: 'user-1' },
    })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(401)
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ pluginConfig: null, user: { id: 'user-1' } })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })

  it('redeploys into the project resolved for the request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          deployments: [{ state: 'READY', uid: 'dpl_1' }],
          pagination: { count: 1 },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'dpl_2' }))

    const req = createMockReq({
      headers: new Headers({ 'x-tenant': 'acme' }),
      pluginConfig: {
        vercel: {
          apiToken: 'test-token',
          projectId: ({ req }) => `prj_${req.headers.get('x-tenant')}`,
        },
      },
      user: { id: 'user-1' },
    })

    const response = await triggerDeploymentEndpoint(req)

    expect(response.status).toBe(200)
    expect(requestedUrls(fetchSpy)[0]).toContain('projectId=prj_acme')
    expect(requestedBody(fetchSpy, 1)).toMatchObject({
      name: 'prj_acme',
      deploymentId: 'dpl_1',
    })
  })

  it('returns 400 without contacting Vercel when no project resolves for the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const req = createMockReq({
      pluginConfig: { vercel: { apiToken: 'test-token', projectId: () => undefined } },
      user: { id: 'user-1' },
    })

    const response = await triggerDeploymentEndpoint(req)

    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
