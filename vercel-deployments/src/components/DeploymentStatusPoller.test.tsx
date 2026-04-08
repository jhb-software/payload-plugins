// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
vi.mock('next/navigation.js', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const { DeploymentStatusPoller } = await import('./DeploymentStatusPoller.js')

function mockFetchResponse(data: object) {
  return { ok: true, text: () => Promise.resolve(JSON.stringify(data)) } as Response
}

const idleDeploymentsResponse = {
  lastReadyDeployment: { inspectorUrl: 'https://vercel.com/i/1', readyAt: '2024-01-01T00:00:00Z', status: 'READY', uid: 'dpl-1' },
  latestDeployment: { createdAt: '2024-01-01T00:00:00Z', inspectorUrl: 'https://vercel.com/i/1', status: 'READY', uid: 'dpl-1' },
}

const buildingDeploymentsResponse = {
  lastReadyDeployment: idleDeploymentsResponse.lastReadyDeployment,
  latestDeployment: { createdAt: '2024-01-02T00:00:00Z', inspectorUrl: 'https://vercel.com/i/2', status: 'BUILDING', uid: 'dpl-2' },
}

describe('DeploymentStatusPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRefresh.mockClear()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockFetchResponse(idleDeploymentsResponse))))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function flushPolling() {
    // Let the immediate poll's fetch + microtasks resolve
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('does not call router.refresh() when polled data is unchanged', async () => {
    render(<DeploymentStatusPoller><div /></DeploymentStatusPoller>)
    await flushPolling()

    // First poll always refreshes (no previous data)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    mockRefresh.mockClear()

    // Advance past idle interval — same data returned
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    await flushPolling()

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('switches to fast polling when an active build is detected', async () => {
    render(<DeploymentStatusPoller><div /></DeploymentStatusPoller>)
    await flushPolling()

    // Simulate external build appearing on next idle poll
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(buildingDeploymentsResponse))

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    await flushPolling()

    // Now it should poll the single-deployment endpoint at the active interval (5s)
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ id: 'dpl-2', status: 'BUILDING' }),
    )
    vi.mocked(fetch).mockClear()

    await vi.advanceTimersByTimeAsync(5 * 1000)
    await flushPolling()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/vercel-deployments?id=dpl-2'),
      expect.anything(),
    )
  })

  it('switches back to idle polling when the build finishes', async () => {
    // Start with a building deployment
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(buildingDeploymentsResponse))
    render(<DeploymentStatusPoller><div /></DeploymentStatusPoller>)
    await flushPolling()

    // Active poll: deployment becomes READY
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ id: 'dpl-2', status: 'READY' }),
    )
    await vi.advanceTimersByTimeAsync(5 * 1000)
    await flushPolling()

    // Should now be back on idle polling — fetch the list endpoint
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(idleDeploymentsResponse))

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    await flushPolling()

    expect(fetch).toHaveBeenCalledWith(
      '/api/vercel-deployments',
      expect.anything(),
    )
  })
})
