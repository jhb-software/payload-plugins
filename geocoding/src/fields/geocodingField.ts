import type { Field, PointField } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

import {
  createMetaBeforeChangeHook,
  createPointBeforeChangeHook,
} from '../hooks/geocodeBeforeChange.js'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores location metadata (display name, address, googlePlaceId)
 * 3. A hidden virtual text field `{pointFieldName}_address` for server-side geocoding via the API
 *
 * Agents and API consumers can submit an address string via the `_address` field,
 * and the beforeChange hooks will auto-geocode it and populate the point and meta fields.
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  const pointFieldName = config.pointField.name

  const metaField: Field = {
    name: pointFieldName + '_meta',
    type: 'json',
    access: config.locationMetaOverride?.access ?? {},
    admin: {
      // overridable props:
      readOnly: true,

      ...config.locationMetaOverride?.admin,

      // non-overridable props:
      components: {
        Field: '@jhb.software/payload-geocoding-plugin/server#GeocodingField',
      },
    },
    hooks: {
      beforeChange: [createMetaBeforeChangeHook({ pointFieldName })],
    },
    jsonSchema: {
      fileMatch: ['a://b/foo.json'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          formattedAddress: { type: 'string' },
          googlePlaceId: { type: 'string' },
          types: { type: 'array', items: { type: 'string' } },
        },
        required: ['formattedAddress', 'googlePlaceId', 'name', 'types'],
      },
      uri: 'a://b/foo.json',
    },
    label: config.locationMetaOverride?.label ?? 'Location',
    required: config.locationMetaOverride?.required,
  }

  const pointField: PointField = {
    ...config.pointField,
    hooks: {
      ...config.pointField.hooks,
      beforeChange: [
        ...(config.pointField.hooks?.beforeChange ?? []),
        createPointBeforeChangeHook({ pointFieldName }),
      ],
    },
  }

  const addressField: Field = {
    name: pointFieldName + '_address',
    type: 'text',
    admin: {
      hidden: true,
    },
    label: 'Address (for server-side geocoding)',
    virtual: true,
  }

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [metaField, pointField, addressField],
  }
}
