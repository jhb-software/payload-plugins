import type { JSONField, PointField, RowField, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import { geocodingField } from './geocodingField.js'

describe('geocodingField', () => {
  it('creates a row field with meta, point, and address fields', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    expect(field.type).toBe('row')
    expect(field.fields).toHaveLength(3)
  })

  it('adds a hidden virtual address text field for server-side geocoding', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    const addressField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_address',
    ) as TextField
    expect(addressField).toBeDefined()
    expect(addressField.type).toBe('text')
    expect(addressField.admin?.hidden).toBe(true)
    expect(addressField.virtual).toBe(true)
  })

  it('adds beforeChange hooks to both meta and point fields', () => {
    const field = geocodingField({
      pointField: { name: 'location', type: 'point' },
    }) as RowField

    const metaField = field.fields.find(
      (f) => 'name' in f && f.name === 'location_meta',
    ) as JSONField
    expect(metaField.hooks?.beforeChange).toHaveLength(1)

    const pointField = field.fields.find((f) => 'name' in f && f.name === 'location') as PointField
    expect(pointField.hooks?.beforeChange).toHaveLength(1)
  })

  it('preserves existing point field hooks', () => {
    const existingHook = () => undefined
    const field = geocodingField({
      pointField: {
        name: 'location',
        type: 'point',
        hooks: { beforeChange: [existingHook] },
      },
    }) as RowField

    const pointField = field.fields.find((f) => 'name' in f && f.name === 'location') as PointField
    expect(pointField.hooks?.beforeChange).toHaveLength(2)
    expect(pointField.hooks!.beforeChange![0]).toBe(existingHook)
  })
})
