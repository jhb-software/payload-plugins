import { describe, expect, it } from 'vitest'

import { normalizeLabel } from './schema.js'

describe('normalizeLabel', () => {
  it('returns plain strings unchanged', () => {
    expect(normalizeLabel('Hotel')).toBe('Hotel')
  })

  it('returns localized label objects unchanged', () => {
    expect(normalizeLabel({ de: 'Sonstige', en: 'Other' })).toEqual({
      de: 'Sonstige',
      en: 'Other',
    })
  })

  it('returns undefined for LabelFunction values (cannot resolve without i18n)', () => {
    const labelFn = ({ t }: { t: (k: string) => string }) => t('fields:other')
    expect(normalizeLabel(labelFn)).toBeUndefined()
  })

  it('returns undefined for `false` (explicitly-hidden label)', () => {
    expect(normalizeLabel(false)).toBeUndefined()
  })

  it('returns undefined for null / undefined', () => {
    expect(normalizeLabel(null)).toBeUndefined()
    expect(normalizeLabel(undefined)).toBeUndefined()
  })

  it('does not treat arrays as localized-label records', () => {
    expect(normalizeLabel(['a', 'b'])).toBeUndefined()
  })
})
