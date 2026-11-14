import { useSyncExternalStore } from 'react'

import { getSearchShortcut } from './getSearchShortcut.js'

const subscribe = () => () => {}

/**
 * Get the keyboard shortcut string for opening the search modal, for use during render.
 *
 * The server cannot see the platform, so the server render and the hydration render both use
 * the macOS label, and the client switches to its own platform's label right after hydrating.
 */
export const useSearchShortcut = (): string =>
  useSyncExternalStore(subscribe, getSearchShortcut, () => '⌘K')
