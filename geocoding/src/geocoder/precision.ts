import type { GeocodePrecision, GeocodingResult } from './types.js'

const RANK: Record<GeocodePrecision, number> = {
  approximate: 0,
  center: 1,
  exact: 3,
  interpolated: 2,
}

/**
 * Whether a result is exact enough. Any stricter requirement than `approximate` also refuses a
 * partial match, since a partial match pins something other than the address that was asked for.
 */
export function meetsPrecision(result: GeocodingResult, minPrecision: GeocodePrecision): boolean {
  if (minPrecision === 'approximate') {
    return true
  }
  return !result.partialMatch && RANK[result.precision] >= RANK[minPrecision]
}
