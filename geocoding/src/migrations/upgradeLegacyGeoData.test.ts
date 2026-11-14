import { describe, expect, test } from 'vitest'

import { upgradeLegacyGeoData } from './upgradeLegacyGeoData.js'

const legacy = {
  label: 'Brandenburger Tor, Pariser Platz, Berlin, Germany',
  value: {
    description: 'Brandenburger Tor, Pariser Platz, Berlin, Germany',
    place_id: 'ChIJiQnyVcZRqEcRY0xnhE77uyY',
    structured_formatting: { main_text: 'Brandenburger Tor' },
    types: ['tourist_attraction'],
  },
}

const meta = {
  name: 'Brandenburger Tor',
  formattedAddress: 'Brandenburger Tor, Pariser Platz, Berlin, Germany',
  googlePlaceId: 'ChIJiQnyVcZRqEcRY0xnhE77uyY',
  types: ['tourist_attraction'],
}

describe('upgradeLegacyGeoData', () => {
  test('renames and converts geodata in array rows, groups and version wrappers', () => {
    const stored = {
      title: 'Author',
      version: {
        travelMap: {
          markers: [{ geoLocation: [13.37, 52.51], geoLocation_googlePlacesData: legacy }],
        },
      },
    }

    expect(upgradeLegacyGeoData(stored)).toEqual({
      title: 'Author',
      version: {
        travelMap: { markers: [{ geoLocation: [13.37, 52.51], geoLocation_meta: meta }] },
      },
    })
  })

  test('drops geodata without a place id instead of storing an invalid meta', () => {
    expect(upgradeLegacyGeoData({ geoLocation_googlePlacesData: { label: 'x' } })).toEqual({
      geoLocation_meta: null,
    })
  })

  test('converts geodata next to an empty meta written after the 0.3 deploy', () => {
    expect(
      upgradeLegacyGeoData({ geoLocation_googlePlacesData: legacy, geoLocation_meta: null }),
    ).toEqual({ geoLocation_meta: meta })
  })

  test('leaves already upgraded documents untouched', () => {
    const upgraded = { geoLocation_meta: meta, list: [{ a: 1 }] }
    expect(upgradeLegacyGeoData(upgraded)).toBe(upgraded)
  })
})
