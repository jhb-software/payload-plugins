import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSearchShortcut } from './useSearchShortcut.js'

const ShortcutLabel = () => <>{useSearchShortcut()}</>

const macUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'

describe('useSearchShortcut', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The hydration render must reproduce the server markup. A first render that reads the
  // platform prints "Ctrl+K" on the server and "⌘K" in a macOS browser, and React then
  // discards the server HTML of the whole admin page.
  it('renders the same label on the server and in a macOS browser before hydration completes', () => {
    vi.stubGlobal('navigator', undefined)
    const serverMarkup = renderToString(<ShortcutLabel />)

    vi.stubGlobal('navigator', { userAgent: macUserAgent })
    const firstClientMarkup = renderToString(<ShortcutLabel />)

    expect(firstClientMarkup).toBe(serverMarkup)
  })
})
