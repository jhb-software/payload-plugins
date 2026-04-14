import type { LanguageModel } from 'ai'
import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  getDefaultMode,
  resolveAvailableModes,
  resolveModeConfig,
  validateModeAccess,
} from './modes.js'

/** Returns a placeholder `LanguageModel` for tests that never call the model. */
const fakeModel = (): LanguageModel => ({}) as unknown as LanguageModel

/**
 * `resolveAvailableModes` / `validateModeAccess` take a full `PayloadRequest`
 * (17+ required fields). The mode logic here only touches `req.user`, so the
 * tests use this partial mock and cast through `unknown` — a deliberate
 * signpost that the mock is intentionally minimal.
 */
const mockReq = { user: { id: 'u1' } } as unknown as PayloadRequest

// ---------------------------------------------------------------------------
// resolveModeConfig
// ---------------------------------------------------------------------------

describe('resolveModeConfig', () => {
  it('returns empty config when no options', () => {
    expect(resolveModeConfig(undefined)).toEqual({})
  })

  it('returns empty config when no modes configured', () => {
    expect(resolveModeConfig({ defaultModel: 'test', model: fakeModel })).toEqual({})
  })

  it('returns modes config directly when provided', () => {
    const modes = { access: {}, default: 'read-write' as const }
    expect(resolveModeConfig({ defaultModel: 'test', model: fakeModel, modes })).toBe(modes)
  })
})

// ---------------------------------------------------------------------------
// resolveAvailableModes
// ---------------------------------------------------------------------------

describe('resolveAvailableModes', () => {
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
    const accessFn = vi.fn(
      ({ req }: { req: PayloadRequest }) =>
        (req.user as { role?: string } | null)?.role === 'admin',
    )
    await resolveAvailableModes({ access: { 'read-write': accessFn } }, {
      user: { role: 'admin' },
    } as unknown as PayloadRequest)
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
