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
              formattedAddress: { description: 'Full formatted address', type: 'string' },
              googlePlaceId: { description: 'Google Places ID', type: 'string' },
              name: { description: 'Place or business name', type: 'string' },
              types: {
                description: 'Place types (e.g. locality, political)',
                items: { type: 'string' },
                type: 'array',
              },
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
