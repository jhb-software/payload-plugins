import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { getDeploymentsEndpoint } from './getDeployments.js'

const mockPluginConfig: VercelDeploymentsPluginConfig = {
  vercel: {
    apiToken: 'test-token',
    projectId: 'test-project',
    teamId: 'test-team',
  },
}

/** Simulated Vercel API deployment data (as returned by the Vercel REST API). */
const readyDeployments = {
  deployments: [
    {
      id: 'dpl-latest',
      name: 'my-project',
      created: 1704110400000, // 2024-01-01T12:00:00Z
      inspectorUrl: 'https://vercel.com/inspect/dpl-latest',
      ready: 1704114000000, // 2024-01-01T13:00:00Z
      state: 'READY' as const,
      status: 'READY' as const,
      uid: 'dpl-latest',
    },
  ],
  pagination: { count: 1 },
}

const mockGetDeployments = vi.fn().mockResolvedValue(readyDeployments)

/** Mock the VercelApiClient so no real HTTP calls are made. */
vi.mock('../utilities/vercelApiClient.js', () => ({
  VercelApiClient: class {
    getDeployment = vi.fn()
    getDeployments = mockGetDeployments
  },
}))

function createMockReq(overrides: { url?: string; user?: { id: string } | null } = {}) {
  return {
    payload: {
      config: {
        custom: { vercelDeploymentsPluginConfig: mockPluginConfig },
      },
    },
    url: overrides.url ?? 'http://localhost:3000/api/vercel-deployments',
    user: overrides.user ?? { id: 'user-1' },
  } as any
}

describe('getDeployments endpoint — response stability for poller comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDeployments.mockResolvedValue(readyDeployments)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('produces identical JSON for consecutive calls with unchanged Vercel data', async () => {
    const response1 = await getDeploymentsEndpoint(createMockReq())
    const response2 = await getDeploymentsEndpoint(createMockReq())

    const text1 = await response1.text()
    const text2 = await response2.text()

    // The poller uses string comparison to skip unnecessary router.refresh() calls.
    // This test verifies that the same Vercel data produces byte-identical JSON,
    // so the poller won't trigger spurious refreshes.
    expect(text1).toBe(text2)
  })

  it('produces different JSON when a new building deployment appears', async () => {
    const response1 = await getDeploymentsEndpoint(createMockReq())
    const text1 = await response1.text()

    // A new BUILDING deployment appears at the top of the list
    mockGetDeployments.mockResolvedValueOnce({
      deployments: [
        {
          id: 'dpl-new',
          name: 'my-project',
          created: 1704200000000,
          inspectorUrl: 'https://vercel.com/inspect/dpl-new',
          state: 'BUILDING' as const,
          status: 'BUILDING' as const,
          uid: 'dpl-new',
        },
        ...readyDeployments.deployments,
      ],
      pagination: { count: 2 },
    })

    const response2 = await getDeploymentsEndpoint(createMockReq())
    const text2 = await response2.text()

    // The JSON must differ so the poller detects the change and refreshes.
    expect(text1).not.toBe(text2)
  })
})
