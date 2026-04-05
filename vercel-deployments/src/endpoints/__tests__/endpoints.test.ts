import { describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../../types.js'

import { getDeploymentInfoEndpoint } from '../getDeploymentInfo.js'
import { getDeploymentsInfoEndpoint } from '../getDeploymentsInfo.js'
import { triggerDeploymentEndpoint } from '../triggerDeployment.js'

const mockPluginConfig: VercelDeploymentsPluginConfig = {
  vercel: {
    apiToken: 'test-token',
    projectId: 'test-project',
    teamId: 'test-team',
  },
}

function createMockReq(overrides: {
  url?: string
  user?: { id: string } | null
  customConfig?: Record<string, unknown>
}) {
  return {
    payload: {
      config: {
        custom: {
          vercelDeploymentsPluginConfig: mockPluginConfig,
          ...overrides.customConfig,
        },
      },
    },
    url: overrides.url ?? 'http://localhost:3000/api/vercel-deployments/status',
    user: overrides.user ?? null,
    json: vi.fn(),
  } as any
}

describe('getDeploymentInfoEndpoint', () => {
  it('returns 401 when user is not authenticated', async () => {
    const req = createMockReq({ user: null })
    const response = await getDeploymentInfoEndpoint(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when id query parameter is missing', async () => {
    const req = createMockReq({
      user: { id: 'user-1' },
      url: 'http://localhost:3000/api/vercel-deployments/status',
    })
    const response = await getDeploymentInfoEndpoint(req)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Missing required query parameter')
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ user: { id: 'user-1' } })
    req.payload.config.custom = {}
    const response = await getDeploymentInfoEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })
})

describe('getDeploymentsInfoEndpoint', () => {
  it('returns 401 when user is not authenticated', async () => {
    const req = createMockReq({ user: null })
    const response = await getDeploymentsInfoEndpoint(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ user: { id: 'user-1' } })
    req.payload.config.custom = {}
    const response = await getDeploymentsInfoEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })
})

describe('triggerDeploymentEndpoint', () => {
  it('returns 401 when user is not authenticated', async () => {
    const req = createMockReq({ user: null })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ user: { id: 'user-1' } })
    req.payload.config.custom = {}
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })
})
