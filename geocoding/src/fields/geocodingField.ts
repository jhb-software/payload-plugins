import type { Field } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores location metadata (display name, address, googlePlaceId)
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [
      {
        name: config.pointField.name + '_meta',
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
      },
      config.pointField,
    ],
  }
}
