import { describe, expect, it } from 'vitest'

import { formatTokens } from './format-tokens.js'

describe('formatTokens', () => {
  it('returns raw number below 1k', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1)).toBe('1')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0k')
    expect(formatTokens(1_500)).toBe('1.5k')
    expect(formatTokens(42_300)).toBe('42.3k')
    expect(formatTokens(999_999)).toBe('1000.0k')
  })

  it('formats millions with M suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(10_000_000)).toBe('10.0M')
  })
})
