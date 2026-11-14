import type { FieldHook, PayloadRequest } from 'payload'

import { ValidationError } from 'payload'

import type { GeocodeQuery, GeocodingResult } from '../geocoder/types.js'
import type { GeocodingAddressArgs, GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'
import type { LocationMeta } from '../types/LocationMeta.js'

import { geocode } from '../geocode.js'
import { meetsPrecision } from '../geocoder/precision.js'

type Point = [number, number]

/** What the hooks of one geocoding field agree to write. `undefined` leaves a value as it is. */
type Resolution = {
  /** Why no point could be geocoded. */
  error?: string
  /** Whether the error refuses the save. */
  fatal?: boolean
  meta?: LocationMeta | null
  point?: null | Point
}

type HookArgs = Parameters<FieldHook>[0]

const KEEP: Resolution = {}

/**
 * One resolution per geocoding field per sibling data object. Payload hands the same `siblingData`
 * object to every field of one document, group, array row or block, and a fresh one to each
 * operation, so two documents (or two blocks) never share a result, even within one request.
 */
const resolutions = new WeakMap<object, Map<string, Promise<Resolution>>>()

export function fieldNames(pointFieldName: string) {
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

function sameQuery(a: GeocodeQuery | undefined, b: GeocodeQuery | undefined): boolean {
  return (
    a?.address === b?.address &&
    (a?.country ?? '').toUpperCase() === (b?.country ?? '').toUpperCase() &&
    a?.language === b?.language
  )
}

function toQuery(value: GeocodeQuery | string | undefined): GeocodeQuery | undefined {
  const query = typeof value === 'string' ? { address: value } : value
  if (!query || typeof query.address !== 'string' || query.address.trim() === '') {
    return undefined
  }
  return { ...query, address: query.address.trim() }
}

function isDraftSave(args: HookArgs): boolean {
  return asRecord(args.data)._status === 'draft'
}

function isAutosave(req: PayloadRequest): boolean {
  const autosave = asRecord(req.query).autosave
  return autosave === true || autosave === 'true'
}

function countryFor(config: GeoCodingFieldConfig, args: GeocodingAddressArgs): string | undefined {
  return typeof config.country === 'function' ? config.country(args) : config.country
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
  onFailure: (error: string) => Resolution,
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

/** Decides, once per field and sibling data object, whether and what to geocode. */
async function resolve(args: HookArgs, config: GeoCodingFieldConfig): Promise<Resolution> {
  const names = fieldNames(config.pointField.name)
  const siblingData = asRecord(args.siblingData)
  const previous = asRecord(args.previousSiblingDoc)
  // Read before any await: the address field's hook clears it once the resolution exists.
  const explicitAddress = siblingData[names.address]

  // A save across all locales carries locale-keyed objects instead of values.
  if (args.req.locale === 'all') {
    return KEEP
  }

  const current: GeocodingAddressArgs = {
    data: asRecord(args.data),
    req: args.req,
    siblingData: { ...previous, ...siblingData },
  }

  // An address sent in `{name}_address` is an explicit request: geocode it, and refuse the save
  // when that fails, drafts included, so the caller learns why.
  const explicit = toQuery(typeof explicitAddress === 'string' ? explicitAddress : undefined)
  if (explicit) {
    const query = { ...explicit, country: countryFor(config, current) }
    return geocodeTo(args.req, query, config, (error) => ({ error, fatal: true }))
  }

  if (!config.address || isAutosave(args.req)) {
    return KEEP
  }

  const incoming = siblingData[names.point]
  const previousPoint = asPoint(previous[names.point])
  const point = incoming === undefined ? previousPoint : asPoint(incoming)
  // A point the caller set in this change is theirs, whatever the address says.
  if (incoming !== undefined && point !== null && !samePoint(point, previousPoint)) {
    return KEEP
  }

  const derive = (from: GeocodingAddressArgs): GeocodeQuery | undefined => {
    const query = toQuery(config.address?.(from))
    return query && { ...query, country: query.country ?? countryFor(config, from) }
  }
  const query = derive(current)
  if (!query) {
    return KEEP
  }
  const previousQuery =
    args.operation === 'update'
      ? derive({ data: asRecord(args.originalDoc), req: args.req, siblingData: previous })
      : undefined
  const addressChanged = !sameQuery(query, previousQuery)

  const geocodedBefore = typeof asRecord(previous[names.meta]).query === 'string'
  const shouldGeocode =
    point === null
      ? // Fill an empty point on create, when the address changed, or when the caller cleared it.
        // An unchanged address that failed before is not retried on every save.
        args.operation === 'create' || addressChanged || previousPoint !== null
      : // Refresh only a point the geocoder set, and only when its address changed.
        geocodedBefore && addressChanged

  if (!shouldGeocode) {
    return KEEP
  }
  // The old pin belongs to the old address, so a failed refresh clears it.
  return geocodeTo(args.req, query, config, (error) => ({
    error,
    fatal: config.pointField.required === true && !isDraftSave(args),
    meta: null,
    point: null,
  }))
}

function resolveOnce(args: HookArgs, config: GeoCodingFieldConfig): Promise<Resolution> {
  const siblingData = asRecord(args.siblingData)
  let byField = resolutions.get(siblingData)
  if (!byField) {
    byField = new Map()
    resolutions.set(siblingData, byField)
  }
  let resolution = byField.get(config.pointField.name)
  if (!resolution) {
    resolution = resolve(args, config)
    byField.set(config.pointField.name, resolution)
  }
  return resolution
}

function refuse(args: HookArgs, config: GeoCodingFieldConfig, message: string): never {
  const path = [...(args.path ?? [])]
  path[path.length - 1] = config.pointField.name
  throw new ValidationError({
    collection: args.collection?.slug,
    errors: [{ message, path: path.join('.') }],
    global: args.global?.slug,
    req: args.req,
  })
}

/**
 * beforeChange hook of the point field: writes the geocoded point, refuses the save when an
 * explicit address fails, and enforces `required` for fields with the `address` option (whose
 * point Payload must not require before the hook had a chance to fill it).
 */
export const createPointBeforeChangeHook =
  (config: GeoCodingFieldConfig): FieldHook =>
  async (args) => {
    const resolution = await resolveOnce(args, config)
    if (resolution.error && resolution.fatal) {
      refuse(args, config, resolution.error)
    }
    const value = resolution.point === undefined ? args.value : resolution.point

    const stored =
      value === undefined ? asRecord(args.previousSiblingDoc)[config.pointField.name] : value
    if (
      config.address &&
      config.pointField.required &&
      asPoint(stored) === null &&
      !isDraftSave(args) &&
      args.req.locale !== 'all'
    ) {
      refuse(
        args,
        config,
        resolution.error ??
          `${config.pointField.name} is required: set the coordinates, or complete the address so they can be geocoded.`,
      )
    }
    return value
  }

/**
 * beforeChange hook of the meta field: writes the geocoded metadata, and clears metadata that
 * describes a point the caller replaced without sending a new place.
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
    const metaUnchanged =
      args.value === undefined ||
      JSON.stringify(args.value) === JSON.stringify(previous[names.meta])
    return pointReplaced && metaUnchanged && previous[names.meta] ? null : args.value
  }

/**
 * beforeChange hook of the address field: the address is an instruction, not content, so it is
 * never stored (inside a Lexical block it would otherwise be geocoded again on every save).
 */
export const createAddressBeforeChangeHook =
  (config: GeoCodingFieldConfig): FieldHook =>
  async (args) => {
    await resolveOnce(args, config)
    return null
  }
