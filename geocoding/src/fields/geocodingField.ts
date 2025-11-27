import type { Field } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores the raw Google Places API geocoding data
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [
      {
        name: config.pointField.name + '_googlePlacesData',
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
        label: config.geoDataFieldOverride?.label ?? 'Location',
        required: config.geoDataFieldOverride?.required,
      },
      config.pointField,
    ],
  }
}
