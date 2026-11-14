import type { FieldHook, PayloadRequest } from 'payload'

import type { GeocodeQuery, GeocodingResult } from '../geocoder/types.js'
import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'
import type { LocationMeta } from '../types/LocationMeta.js'

import { PLUGIN_SLUG } from '../constants.js'
import { geocode } from '../geocode.js'
import { meetsPrecision } from '../geocoder/precision.js'

type Point = [number, number]

/** What both hooks of one geocoding field agree to write. `undefined` leaves a value as it is. */
type Resolution = {
  /** Why the point is empty, reported by the point field's validation. */
  error?: string
  meta?: LocationMeta | null
  point?: null | Point
}

type HookArgs = Parameters<FieldHook>[0]

type Names = { address: string; meta: string; point: string }

const KEEP: Resolution = {}

export function fieldNames(pointFieldName: string): Names {
  return {
    address: `${pointFieldName}_address`,
    meta: `${pointFieldName}_meta`,
    point: pointFieldName,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asPoint(value: unknown): null | Point {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
    ? [value[0], value[1]]
    : null
}

function samePoint(a: null | Point, b: null | Point): boolean {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1])
}

function toQuery(value: GeocodeQuery | string | undefined): GeocodeQuery | undefined {
  const query = typeof value === 'string' ? { address: value } : value
  return query && query.address.trim() !== ''
    ? { ...query, address: query.address.trim() }
    : undefined
}

/** Identifies one geocoding field of one document within a request (bulk updates share it). */
export function resolutionKey(docId: unknown, path: readonly (number | string)[]): string {
  const id = typeof docId === 'string' || typeof docId === 'number' ? docId : 'new'
  return `${PLUGIN_SLUG}:${id}:${path.join('.')}`
}

/** Error the point field's validation reports, keyed like the resolution. */
export function errorKey(key: string): string {
  return `${key}:error`
}

function toMeta(result: GeocodingResult, query: GeocodeQuery): LocationMeta {
  return {
    name: result.name,
    formattedAddress: result.formattedAddress,
    googlePlaceId: result.placeId,
    partialMatch: result.partialMatch,
    precision: result.precision,
    query: query.address,
    types: result.types,
  }
}

async function geocodeTo(
  req: PayloadRequest,
  query: GeocodeQuery,
  config: GeoCodingFieldConfig,
  onFailure: (message: string) => Resolution,
): Promise<Resolution> {
  const outcome = await geocode({ req, ...query })
  if (!outcome.ok) {
    return onFailure(`Could not geocode "${query.address}": ${outcome.message}`)
  }
  const minPrecision = config.minPrecision ?? 'approximate'
  const result = outcome.results.find((candidate) => meetsPrecision(candidate, minPrecision))
  if (!result) {
    const best = outcome.results[0]
    return onFailure(
      `Could not geocode "${query.address}" exactly enough: the best match "${best.formattedAddress}" is ${best.partialMatch ? 'a partial match' : `only ${best.precision}`}, and this field needs ${minPrecision}. Add the house number or postal code, or set the coordinates directly.`,
    )
  }
  return { meta: toMeta(result, query), point: [result.location.lng, result.location.lat] }
}

/** Decides, once per field and document, whether and what to geocode. */
async function resolve(args: HookArgs, config: GeoCodingFieldConfig): Promise<Resolution> {
  const names = fieldNames(config.pointField.name)
  const siblingData =
    args.siblingData && typeof args.siblingData === 'object' ? args.siblingData : {}
  const previous = asRecord(args.previousSiblingDoc)

  // An address sent in `{name}_address` is an explicit request: geocode it, and fail loudly.
  const explicit = toQuery(
    typeof siblingData[names.address] === 'string'
      ? (siblingData[names.address] as string)
      : undefined,
  )
  if (explicit) {
    // Consumed: inside a Lexical block the virtual field would otherwise be stored in the block's
    // JSON and geocoded again on every later save.
    delete siblingData[names.address]
    return geocodeTo(args.req, explicit, config, (error) => ({ error }))
  }

  if (!config.address) {
    return KEEP
  }

  const incoming = siblingData[names.point]
  const previousPoint = asPoint(previous[names.point])
  const point = incoming === undefined ? previousPoint : asPoint(incoming)
  // A point the caller set in this change is theirs, whatever the address says.
  if (incoming !== undefined && point !== null && !samePoint(point, previousPoint)) {
    return KEEP
  }

  const query = toQuery(
    config.address({ data: asRecord(args.data), siblingData: { ...previous, ...siblingData } }),
  )
  if (!query) {
    return KEEP
  }

  if (point === null) {
    return geocodeTo(args.req, query, config, (error) => ({ error, meta: null, point: null }))
  }

  // Re-geocode only a point the geocoder set (its meta remembers the query) whose address moved.
  const previousQuery = asRecord(previous[names.meta]).query
  if (typeof previousQuery === 'string' && previousQuery !== query.address) {
    // The old pin belongs to the old address, so a failed refresh clears it.
    return geocodeTo(args.req, query, config, (error) => ({ error, meta: null, point: null }))
  }
  return KEEP
}

function resolveOnce(args: HookArgs, config: GeoCodingFieldConfig): Promise<Resolution> {
  // The meta and point hooks run in parallel (row fields), so both await one promise.
  const key = resolutionKey(asRecord(args.originalDoc).id, pointPath(args, config))
  const cached = args.req.context[key]
  if (cached instanceof Promise) {
    return cached as Promise<Resolution>
  }
  const created = resolve(args, config)
  args.req.context[key] = created
  return created
}

/** The point field's path, whichever of the two fields' hooks is asking. */
function pointPath(args: HookArgs, config: GeoCodingFieldConfig): (number | string)[] {
  const path = [...(args.path ?? [])]
  path[path.length - 1] = config.pointField.name
  return path
}

/** beforeChange hook of the point field: writes the geocoded point and records any failure. */
export const createPointBeforeChangeHook =
  (config: GeoCodingFieldConfig): FieldHook =>
  async (args) => {
    const resolution = await resolveOnce(args, config)
    const key = resolutionKey(asRecord(args.originalDoc).id, pointPath(args, config))
    args.req.context[errorKey(key)] = resolution.error
    return resolution.point === undefined ? args.value : resolution.point
  }

/**
 * beforeChange hook of the meta field: writes the geocoded metadata, and drops the remembered
 * query when the caller replaced the point, so a later address change leaves their point alone.
 */
export const createMetaBeforeChangeHook =
  (config: GeoCodingFieldConfig): FieldHook =>
  async (args) => {
    const resolution = await resolveOnce(args, config)
    if (resolution.meta !== undefined) {
      return resolution.meta
    }

    const names = fieldNames(config.pointField.name)
    const siblingData = asRecord(args.siblingData)
    const previous = asRecord(args.previousSiblingDoc)
    const incomingPoint = siblingData[names.point]
    const pointReplaced =
      incomingPoint !== undefined &&
      !samePoint(asPoint(incomingPoint), asPoint(previous[names.point]))
    if (!pointReplaced) {
      return args.value
    }
    const meta = asRecord(args.value ?? previous[names.meta])
    if (typeof meta.query !== 'string') {
      return args.value
    }
    const { query: _query, ...entered } = meta
    return entered
  }
