// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = { routes: { api: '/api' }, serverURL: '' }
const mockSetAltText = vi.fn()
const mockSetKeywords = vi.fn()

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
  toast: { error: vi.fn(), success: vi.fn() },
  useConfig: () => ({ config: mockConfig }),
  useDocumentInfo: () => ({ id: 'doc-1', collectionSlug: 'media' }),
  useField: ({ path }: { path: string }) => {
    if (path === 'alt') {
      return { setValue: mockSetAltText, value: '' }
    }
    if (path === 'keywords') {
      return { setValue: mockSetKeywords, value: '' }
    }
    if (path === 'mimeType') {
      return { setValue: vi.fn(), value: 'image/png' }
    }
    return { setValue: vi.fn(), value: '' }
  },
  useLocale: () => ({ code: 'en' }),
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { GenerateAltTextButton } = await import('./GenerateAltTextButton.js')

describe('GenerateAltTextButton', () => {
  beforeEach(() => {
    mockConfig.routes.api = '/api'
    mockConfig.serverURL = ''
    mockSetAltText.mockClear()
    mockSetKeywords.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ altText: 'A cat', keywords: ['cat'] }),
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
    render(<GenerateAltTextButton supportedMimeTypes={['image/png']} />)
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      '/api/alt-text-plugin/generate',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('posts to the configured API route when a custom route is set', async () => {
    mockConfig.routes.api = '/custom-api'
    mockConfig.serverURL = 'https://cms.example.com'

    render(<GenerateAltTextButton supportedMimeTypes={['image/png']} />)
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith(
      'https://cms.example.com/custom-api/alt-text-plugin/generate',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
