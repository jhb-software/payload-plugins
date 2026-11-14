import type { GeocodePrecision } from '../geocoder/types.js'

/** What the `{name}_meta` JSON field stores about the selected or geocoded place. */
export type LocationMeta = {
  formattedAddress: string
  googlePlaceId: string
  name: string
  /** Set by server-side geocoding: true when only part of the address matched. */
  partialMatch?: boolean
  /** Set by server-side geocoding: how exactly the point pins the address. */
  precision?: GeocodePrecision
  /**
   * Set by server-side geocoding: the address the point was geocoded from. Its presence marks the
   * point as geocoded rather than entered, so a later address change may re-geocode it.
   */
  query?: string
  types: string[]
}
