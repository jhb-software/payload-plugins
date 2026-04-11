// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockNotifyBuildTriggered = vi.fn()
vi.mock('./DeploymentStatusPoller.js', () => ({
  useDeploymentPoller: () => ({ notifyBuildTriggered: mockNotifyBuildTriggered }),
}))

vi.mock('../react-hooks/useDashboardTranslation.js', () => ({
  useDashboardTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  toast: { error: vi.fn(), success: vi.fn() },
  useConfig: () => ({ config: mockConfig }),
}))

const mockConfig = { routes: { api: '/api' }, serverURL: '' }

const { TriggerFrontendDeploymentButton } = await import('./TriggerDeploymentButton.js')

describe('TriggerFrontendDeploymentButton', () => {
  beforeEach(() => {
    mockConfig.routes.api = '/api'
    mockConfig.serverURL = ''
    mockNotifyBuildTriggered.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ id: 'dpl-1' }),
          ok: true,
        } as Response),
      ),
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('posts to the default /api route when no custom route is configured', async () => {
    render(<TriggerFrontendDeploymentButton />)
    fireEvent.click(screen.getByRole('button'))
    // wait for the transition microtask + fetch promise to settle
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      '/api/vercel-deployments',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('posts to the configured API route when a custom route is set', async () => {
    mockConfig.routes.api = '/custom-api'
    mockConfig.serverURL = 'https://cms.example.com'

    render(<TriggerFrontendDeploymentButton />)
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      'https://cms.example.com/custom-api/vercel-deployments',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
