import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VercelApiClient } from '../vercelApiClient.js'

describe('VercelApiClient', () => {
  let client: VercelApiClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    client = new VercelApiClient('test-bearer-token')
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDeployments', () => {
    it('calls the correct URL with projectId and auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deployments: [], pagination: { count: 0 } }),
      })

      await client.getDeployments({ projectId: 'prj-123' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v6/deployments'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-bearer-token',
          }),
          method: 'GET',
        }),
      )

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('projectId=prj-123')
    })

    it('includes teamId, target, state, and limit when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deployments: [], pagination: { count: 0 } }),
      })

      await client.getDeployments({
        projectId: 'prj-123',
        teamId: 'team-456',
        target: 'production',
        state: 'READY',
        limit: 5,
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('teamId=team-456')
      expect(calledUrl).toContain('target=production')
      expect(calledUrl).toContain('state=READY')
      expect(calledUrl).toContain('limit=5')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      await expect(client.getDeployments({ projectId: 'prj-123' })).rejects.toThrow(
        'Vercel API error: 403 Forbidden',
      )
    })
  })

  describe('getDeployment', () => {
    it('calls the correct URL with deployment id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'dpl-abc',
            uid: 'dpl-abc',
            name: 'test',
            status: 'READY',
            state: 'READY',
            created: Date.now(),
          }),
      })

      const result = await client.getDeployment({ idOrUrl: 'dpl-abc' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v13/deployments/dpl-abc'),
        expect.anything(),
      )
      expect(result.id).toBe('dpl-abc')
    })
  })

  describe('createDeployment', () => {
    it('sends POST request with correct body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'dpl-new',
            uid: 'dpl-new',
            name: 'test',
            status: 'BUILDING',
            created: Date.now(),
          }),
      })

      const result = await client.createDeployment({
        requestBody: {
          deploymentId: 'dpl-old',
          name: 'my-project',
          target: 'production',
        },
        teamId: 'team-456',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v13/deployments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            deploymentId: 'dpl-old',
            name: 'my-project',
            target: 'production',
          }),
        }),
      )

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('teamId=team-456')
      expect(result.id).toBe('dpl-new')
    })
  })
})
