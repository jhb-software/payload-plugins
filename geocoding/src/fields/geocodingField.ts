import { Field } from 'payload'
import { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig'
import { getPluginApiKey } from '../plugin-state'

/**
 * Creates a row field containing:
 * 1. The provided point field for storing the coordinates from the Google Places API
 * 2. A JSON field that stores the raw Google Places API geocoding data
 *
 * Note: This function retrieves the Google Maps API key from plugin state (singleton pattern).
 * The API key must be configured in payloadGeocodingPlugin before calling this function.
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  // Get API key from plugin state (set during plugin initialization)
  const googleMapsApiKey = getPluginApiKey()

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [
      {
        name: config.pointField.name + '_googlePlacesData',
        type: 'json',
        label: config.geoDataFieldOverride?.label ?? 'Location',
        access: config.geoDataFieldOverride?.access ?? {},
        required: config.geoDataFieldOverride?.required,
        admin: {
          // overridable props:
          readOnly: true,

          ...config.geoDataFieldOverride?.admin,

          // non-overridable props:
          components: {
            Field: {
              path: '@jhb.software/payload-geocoding-plugin/client#GeocodingFieldComponent',
              clientProps: {
                googleMapsApiKey, // Pass API key via clientProps
              },
            },
          },
        },
      },
      config.pointField,
    ],
  }
}
