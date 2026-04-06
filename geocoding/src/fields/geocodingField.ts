import type { Field } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

import { createGeocodeBeforeChangeHook } from '../hooks/geocodeBeforeChange.js'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores the raw Google Places API geocoding data
 * 3. A hidden text field `{pointFieldName}_address` for server-side geocoding via the API
 *
 * Agents and API consumers can submit an address string via the `_address` field,
 * and the beforeChange hook will auto-geocode it and populate the point and geodata fields.
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  const pointFieldName = config.pointField.name

  const geoDataField: Field = {
    name: pointFieldName + '_googlePlacesData',
    type: 'json',
    access: config.geoDataFieldOverride?.access ?? {},
    admin: {
      // overridable props:
      readOnly: true,

      ...config.geoDataFieldOverride?.admin,

      // non-overridable props:
      components: {
        Field: '@jhb.software/payload-geocoding-plugin/server#GeocodingField',
      },
    },
    hooks: {
      beforeChange: [
        createGeocodeBeforeChangeHook({ pointFieldName }),
      ],
    },
    label: config.geoDataFieldOverride?.label ?? 'Location',
    required: config.geoDataFieldOverride?.required,
  }

  const addressField: Field = {
    name: pointFieldName + '_address',
    type: 'text',
    admin: {
      hidden: true,
    },
    hooks: {
      // Clear the address field after processing so it is not persisted
      beforeChange: [() => undefined],
    },
    label: 'Address (for server-side geocoding)',
  }

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [geoDataField, config.pointField, addressField],
  }
}
