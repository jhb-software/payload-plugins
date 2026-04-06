import type { Field } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

import { createGeocodeBeforeChangeHook } from '../hooks/geocodeBeforeChange.js'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores the raw Google Places API geocoding data
 * 3. (Optional) A text field for server-side geocoding via address string (for API/agent usage)
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
    label: config.geoDataFieldOverride?.label ?? 'Location',
    required: config.geoDataFieldOverride?.required,
  }

  const fields: Field[] = [geoDataField, config.pointField]

  // When serverGeocoding is configured, add the address field and beforeChange hook
  if (config.serverGeocoding) {
    const addressField: Field = {
      name: pointFieldName + '_address',
      type: 'text',
      admin: {
        description:
          'Submit an address string to auto-geocode server-side. This field is not persisted.',
      },
      hooks: {
        // Clear the address field after processing so it is not persisted
        beforeChange: [() => undefined],
      },
      label: 'Address (for server-side geocoding)',
    }

    geoDataField.hooks = {
      ...geoDataField.hooks,
      beforeChange: [
        createGeocodeBeforeChangeHook({
          apiKey: config.serverGeocoding.apiKey,
          pointFieldName,
        }),
      ],
    }

    fields.push(addressField)
  }

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields,
  }
}
