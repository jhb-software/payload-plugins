import type { JSONField, PointField } from 'payload'

/** Configuration for the geocoding fields. */
export type GeoCodingFieldConfig = {
  locationMetaOverride?: {
    access?: JSONField['access']
    admin?: JSONField['admin']
    label?: string
    required?: boolean
  }
  pointField: PointField
}
