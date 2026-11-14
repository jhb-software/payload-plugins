import { describe, expect, test } from 'vitest'

import { formatSlug } from '../src/index.js'

describe('formatSlug (public export)', () => {
  test('is reachable from the package entry point', () => {
    expect(typeof formatSlug).toBe('function')
  })

  test('normalizes a title into a slug the slug field accepts', () => {
    // The slug field validates with formatSlug, so formatSlug(formatSlug(x))
    // must be stable — a derived slug is only accepted when it is a fixed point.
    const slug = formatSlug('Über den Wölkchen: Reise-Tipps!')

    expect(slug).toBe('ueber-den-woelkchen-reise-tipps')
    expect(formatSlug(slug)).toBe(slug)
  })
})
