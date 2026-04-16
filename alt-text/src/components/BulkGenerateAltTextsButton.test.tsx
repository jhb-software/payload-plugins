// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = { routes: { api: '/api' }, serverURL: '' }
const mockSetSelection = vi.fn()

vi.mock('next/navigation.js', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  useConfig: () => ({ config: mockConfig }),
  useSelection: () => ({
    selected: new Map([
      ['doc-1', true],
      ['doc-2', true],
    ]),
    setSelection: mockSetSelection,
  }),
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { BulkGenerateAltTextsButton } = await import('./BulkGenerateAltTextsButton.js')

describe('BulkGenerateAltTextsButton', () => {
  beforeEach(() => {
    mockConfig.routes.api = '/api'
    mockConfig.serverURL = ''
    mockSetSelection.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ erroredDocs: [], totalDocs: 2, updatedDocs: 2 }),
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
    render(<BulkGenerateAltTextsButton collectionSlug="media" />)
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      '/api/alt-text-plugin/generate/bulk',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('posts to the configured API route when a custom route is set', async () => {
    mockConfig.routes.api = '/custom-api'
    mockConfig.serverURL = 'https://cms.example.com'

    render(<BulkGenerateAltTextsButton collectionSlug="media" />)
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      'https://cms.example.com/custom-api/alt-text-plugin/generate/bulk',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
