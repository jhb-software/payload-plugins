import type { JSONField, PayloadRequest, PointField } from 'payload'

import type { GeocodePrecision, GeocodeQuery } from '../geocoder/types.js'

/** The document data an `address` or `country` function reads from. */
export type GeocodingAddressArgs = {
  /** The whole document as it will be saved (incoming data merged over the stored document). */
  data: Record<string, unknown>
  /** The request, e.g. for `req.locale`. */
  req: PayloadRequest
  /** The data next to the point field (e.g. the group, array row or block it sits in). */
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
   * With this option a required point is enforced by the plugin instead of Payload, so the admin
   * panel can save a document whose point is still to be geocoded.
   *
   * @example
   * address: ({ siblingData }) =>
   *   siblingData.street && siblingData.city
   *     ? { address: `${siblingData.street}, ${siblingData.city}`, country: siblingData.country }
   *     : undefined
   */
  address?: (args: GeocodingAddressArgs) => GeocodeQuery | string | undefined
  /**
   * ISO 3166-1 alpha-2 country code that results must lie in, for every address this field
   * geocodes (an `address` result that sets its own country wins). Use a function to read it from
   * the document.
   */
  country?: ((args: GeocodingAddressArgs) => string | undefined) | string
  locationMetaOverride?: {
    access?: JSONField['access']
    admin?: JSONField['admin']
    label?: string
    required?: boolean
  }
  /**
   * The least exact result the field stores. Anything stricter than `approximate` also refuses
   * partial matches.
   *
   * @default 'approximate'
   */
  minPrecision?: GeocodePrecision
  pointField: PointField
}
