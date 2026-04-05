import { describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../../types.js'

import { getDeploymentsEndpoint } from '../getDeployments.js'
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
  pluginConfig?: VercelDeploymentsPluginConfig | null
}) {
  return {
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
    json: vi.fn(),
  } as any
}

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
      user: { id: 'user-1' },
      pluginConfig: { ...mockPluginConfig, access: () => false },
    })
    const response = await getDeploymentsEndpoint(req)
    expect(response.status).toBe(401)
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ user: { id: 'user-1' }, pluginConfig: null })
    const response = await getDeploymentsEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
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
      user: { id: 'user-1' },
      pluginConfig: { ...mockPluginConfig, access: () => false },
    })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(401)
  })

  it('returns 500 when plugin config is not found', async () => {
    const req = createMockReq({ user: { id: 'user-1' }, pluginConfig: null })
    const response = await triggerDeploymentEndpoint(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Plugin config not found')
  })
})
