import type { JSONField, PointField } from 'payload'

import type { GeocodePrecision, GeocodeQuery } from '../geocoder/types.js'

/** The document data a field's `address` function reads from. */
export type GeocodingAddressArgs = {
  /** The whole document as it will be saved (incoming data merged over the stored document). */
  data: Record<string, unknown>
  /** The data next to the point field (e.g. the group or array row it sits in). */
  siblingData: Record<string, unknown>
}

/** Configuration for the geocoding fields. */
export type GeoCodingFieldConfig = {
  /**
   * Derives the address to geocode from the document, so the point fills itself from address
   * fields the document already has. Return a string, a query with a country and language, or
   * `undefined` while the address is incomplete.
   *
   * The point is geocoded when it is empty, and again when the address changes, but only while
   * the stored point came from geocoding: a point someone entered or picked is never overwritten.
   *
   * @example
   * address: ({ siblingData }) =>
   *   siblingData.street && siblingData.city
   *     ? { address: `${siblingData.street}, ${siblingData.city}`, country: siblingData.country }
   *     : undefined
   */
  address?: (args: GeocodingAddressArgs) => GeocodeQuery | string | undefined
  locationMetaOverride?: {
    access?: JSONField['access']
    admin?: JSONField['admin']
    label?: string
    required?: boolean
  }
  /**
   * The least exact result the field stores. Anything stricter than `approximate` also refuses
   * partial matches. A refused result leaves the point empty, and saving fails with the reason if
   * the point is required.
   *
   * @default 'approximate'
   */
  minPrecision?: GeocodePrecision
  pointField: PointField
}
