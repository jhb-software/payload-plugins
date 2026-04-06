import type { JSONField, PointField } from 'payload'

/** Configuration for the geocoding fields. */
export type GeoCodingFieldConfig = {
  geoDataFieldOverride?: {
    access?: JSONField['access']
    admin?: JSONField['admin']
    label?: string
    required?: boolean
  }
  pointField: PointField
  /**
   * Enable server-side geocoding for API/agent usage.
   * When configured, adds a `{pointFieldName}_address` text field.
   * Submitting an address string via the API will auto-geocode it
   * and populate the point and geodata fields server-side.
   */
  serverGeocoding?: {
    /** Google Maps API key. Required for server-side geocoding. */
    apiKey: string
  }
}
