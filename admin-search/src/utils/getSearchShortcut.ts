/** Check if the user is on a Mac based on user agent */
const isMac = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /mac/i.test(navigator.userAgent)
}

/** Get the keyboard shortcut string for opening the search modal for the current platform */
export const getSearchShortcut = (): string => {
  return isMac() ? '⌘K' : 'Ctrl+K'
}
