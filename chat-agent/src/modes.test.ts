import { describe, expect, it, vi } from 'vitest'

import {
  getDefaultMode,
  resolveAvailableModes,
  resolveModeConfig,
  validateModeAccess,
} from './modes.js'

// ---------------------------------------------------------------------------
// resolveModeConfig
// ---------------------------------------------------------------------------

describe('resolveModeConfig', () => {
  it('returns empty config when no options', () => {
    expect(resolveModeConfig(undefined)).toEqual({})
  })

  it('returns empty config when no modes configured', () => {
    expect(resolveModeConfig({ defaultModel: 'test', model: (() => ({})) as any })).toEqual({})
  })

  it('returns modes config directly when provided', () => {
    const modes = { access: {}, default: 'read-write' as const }
    expect(resolveModeConfig({ defaultModel: 'test', model: (() => ({})) as any, modes })).toBe(
      modes,
    )
  })
})

// ---------------------------------------------------------------------------
// resolveAvailableModes
// ---------------------------------------------------------------------------

describe('resolveAvailableModes', () => {
  const mockReq = { user: { id: 'u1' } }

  it('returns read, ask, read-write by default (no config)', async () => {
    const modes = await resolveAvailableModes({}, mockReq)
    expect(modes).toEqual(['read', 'ask', 'read-write'])
  })

  it('always includes read even if access function returns false', async () => {
    const modes = await resolveAvailableModes({ access: { read: () => false } }, mockReq)
    expect(modes).toContain('read')
  })

  it('excludes superuser when no access function configured', async () => {
    const modes = await resolveAvailableModes({}, mockReq)
    expect(modes).not.toContain('superuser')
  })

  it('includes superuser when access function returns true', async () => {
    const modes = await resolveAvailableModes({ access: { superuser: () => true } }, mockReq)
    expect(modes).toContain('superuser')
  })

  it('excludes superuser when access function returns false', async () => {
    const modes = await resolveAvailableModes({ access: { superuser: () => false } }, mockReq)
    expect(modes).not.toContain('superuser')
  })

  it('excludes modes when their access function returns false', async () => {
    const modes = await resolveAvailableModes({ access: { 'read-write': () => false } }, mockReq)
    expect(modes).not.toContain('read-write')
    expect(modes).toContain('read')
    expect(modes).toContain('ask')
  })

  it('passes req to access functions', async () => {
    const accessFn = vi.fn(({ req }: any) => req.user?.role === 'admin')
    await resolveAvailableModes({ access: { 'read-write': accessFn } }, { user: { role: 'admin' } })
    expect(accessFn).toHaveBeenCalledWith({ req: { user: { role: 'admin' } } })
  })

  it('handles async access functions', async () => {
    const modes = await resolveAvailableModes(
      { access: { 'read-write': () => Promise.resolve(true) } },
      mockReq,
    )
    expect(modes).toContain('read-write')
  })
})

// ---------------------------------------------------------------------------
// validateModeAccess
// ---------------------------------------------------------------------------

describe('validateModeAccess', () => {
  const mockReq = { user: { id: 'u1' } }

  it('returns null for valid mode with access', async () => {
    const error = await validateModeAccess('ask', {}, mockReq)
    expect(error).toBeNull()
  })

  it('returns error for invalid mode string', async () => {
    const error = await validateModeAccess('invalid', {}, mockReq)
    expect(error).toContain('Invalid mode')
  })

  it('returns error for non-string mode', async () => {
    const error = await validateModeAccess(42, {}, mockReq)
    expect(error).toContain('Invalid mode')
  })

  it('returns error when user lacks access to mode', async () => {
    const error = await validateModeAccess('superuser', {}, mockReq)
    expect(error).toContain('Access denied')
  })

  it('returns null when user has access to superuser', async () => {
    const error = await validateModeAccess(
      'superuser',
      { access: { superuser: () => true } },
      mockReq,
    )
    expect(error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getDefaultMode
// ---------------------------------------------------------------------------

describe('getDefaultMode', () => {
  it('returns ask by default', () => {
    expect(getDefaultMode({})).toBe('ask')
  })

  it('returns configured default', () => {
    expect(getDefaultMode({ default: 'read-write' })).toBe('read-write')
  })
})
