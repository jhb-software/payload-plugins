import type { JSONField, RowField, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import { geocodingField } from './geocodingField.js'

describe('geocodingField', () => {
  it('creates a row field with point, geodata, and address fields', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    expect(field.type).toBe('row')
    // geodata JSON + point + hidden address field
    expect(field.fields).toHaveLength(3)
  })

  it('always adds a hidden address text field for server-side geocoding', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    const addressField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_address',
    ) as TextField
    expect(addressField).toBeDefined()
    expect(addressField.type).toBe('text')
    expect(addressField.admin?.hidden).toBe(true)
  })

  it('always adds a beforeChange hook to the geodata field', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    const geoDataField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_googlePlacesData',
    ) as JSONField
    expect(geoDataField.hooks?.beforeChange).toBeDefined()
    expect(geoDataField.hooks!.beforeChange).toHaveLength(1)
  })
})
