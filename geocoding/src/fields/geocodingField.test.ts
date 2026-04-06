import type { JSONField, RowField, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import { geocodingField } from './geocodingField.js'

describe('geocodingField', () => {
  it('creates a row field with point and geodata fields', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    expect(field.type).toBe('row')
    expect(field.fields).toHaveLength(2)
  })

  it('adds an address text field and hook when serverGeocoding is configured', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
      serverGeocoding: { apiKey: 'test-key' },
    }) as RowField

    // Should have 3 fields: geodata JSON, point, and address text
    expect(field.fields).toHaveLength(3)

    // Find the address field
    const addressField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_address',
    ) as TextField
    expect(addressField).toBeDefined()
    expect(addressField.type).toBe('text')

    // The geodata JSON field should have a beforeChange hook
    const geoDataField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_googlePlacesData',
    ) as JSONField
    expect(geoDataField.hooks?.beforeChange).toBeDefined()
    expect(geoDataField.hooks!.beforeChange).toHaveLength(1)
  })

  it('does not add address field or hook when serverGeocoding is not configured', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    expect(field.fields).toHaveLength(2)

    const addressField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_address',
    )
    expect(addressField).toBeUndefined()
  })
})
