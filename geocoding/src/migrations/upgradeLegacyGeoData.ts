import type { BasePayload } from 'payload'

import type { LocationMeta } from '../types/LocationMeta.js'

const LEGACY_SUFFIX = '_googlePlacesData'
const META_SUFFIX = '_meta'

type LegacyGeoData = {
  label?: unknown
  value?: {
    description?: unknown
    place_id?: unknown
    structured_formatting?: { main_text?: unknown }
    types?: unknown
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Converts one value stored by 0.2.x (react-google-places-autocomplete) to the 0.3 meta shape. */
export function toLocationMeta(legacy: unknown): LocationMeta | null {
  const value = (legacy as LegacyGeoData | null)?.value
  const placeId = text(value?.place_id)
  if (!placeId) {
    return null
  }
  const formattedAddress = text(value?.description) ?? text((legacy as LegacyGeoData).label) ?? ''
  return {
    name: text(value?.structured_formatting?.main_text) ?? formattedAddress,
    formattedAddress,
    googlePlaceId: placeId,
    types: Array.isArray(value?.types)
      ? value.types.filter((type): type is string => typeof type === 'string')
      : [],
  }
}

/**
 * Returns a copy of a stored document (or any nested value) with every `{name}_googlePlacesData`
 * key, at any depth (groups, arrays, blocks, Lexical blocks, versions), replaced by `{name}_meta`
 * in the 0.3 shape. Returns the same reference when nothing changed.
 */
export function upgradeLegacyGeoData<T>(value: T): T {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item: unknown) => {
      const upgraded = upgradeLegacyGeoData(item)
      changed ||= upgraded !== item
      return upgraded
    })
    return (changed ? next : value) as T
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value
  }
  let changed = false
  const next: Record<string, unknown> = {}
  const legacyKeys: string[] = []
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith(LEGACY_SUFFIX)) {
      legacyKeys.push(key)
      continue
    }
    const upgraded = upgradeLegacyGeoData(child)
    changed ||= upgraded !== child
    next[key] = upgraded
  }
  // After the other keys, so an empty `_meta` (saved before the migration ran) is filled in.
  for (const key of legacyKeys) {
    changed = true
    const metaKey = key.slice(0, -LEGACY_SUFFIX.length) + META_SUFFIX
    if (next[metaKey] == null) {
      next[metaKey] = toLocationMeta((value as Record<string, unknown>)[key])
    }
  }
  return (changed ? next : value) as T
}

type NativeCollection = {
  find: (filter: object) => AsyncIterable<Record<string, unknown>>
  updateOne: (filter: object, update: object) => Promise<unknown>
}

function nativeCollections(db: unknown): NativeCollection[] {
  const adapter = db as {
    collections?: Record<string, { collection?: NativeCollection }>
    globals?: { collection?: NativeCollection }
    name?: string
    versions?: Record<string, { collection?: NativeCollection }>
  }
  if (adapter.name !== 'mongoose') {
    throw new Error(
      'migrateGeocodingDataToV03 supports MongoDB only. On Postgres or SQLite, write a Payload migration that renames each `*_google_places_data` column to `*_meta` and converts the JSON with upgradeLegacyGeoData before the old columns are dropped.',
    )
  }
  return [
    ...Object.values(adapter.collections ?? {}),
    ...Object.values(adapter.versions ?? {}),
    adapter.globals,
  ]
    .map((model) => model?.collection)
    .filter((collection): collection is NativeCollection => Boolean(collection))
}

/**
 * Upgrades every document, version and global stored by plugin 0.2.x to the 0.3 meta shape, in
 * place, on MongoDB. Reads the raw documents, so it works after the config no longer declares the
 * `_googlePlacesData` fields. Safe to run twice.
 *
 * @example
 * // src/migrations/20260101_geocoding_v03.ts
 * export async function up({ payload }: MigrateUpArgs) {
 *   await migrateGeocodingDataToV03(payload)
 * }
 */
export async function migrateGeocodingDataToV03(
  payload: BasePayload,
): Promise<{ migrated: number }> {
  let migrated = 0
  for (const collection of nativeCollections(payload.db)) {
    for await (const doc of collection.find({})) {
      const set: Record<string, unknown> = {}
      const unset: Record<string, ''> = {}
      for (const [key, value] of Object.entries(doc)) {
        if (key.endsWith(LEGACY_SUFFIX)) {
          unset[key] = ''
          const metaKey = key.slice(0, -LEGACY_SUFFIX.length) + META_SUFFIX
          if (doc[metaKey] == null) {
            set[metaKey] = toLocationMeta(value)
          }
          continue
        }
        const upgraded = upgradeLegacyGeoData(value)
        if (upgraded !== value) {
          set[key] = upgraded
        }
      }
      if (Object.keys(set).length > 0 || Object.keys(unset).length > 0) {
        await collection.updateOne(
          { _id: doc._id },
          {
            ...(Object.keys(set).length > 0 && { $set: set }),
            ...(Object.keys(unset).length > 0 && { $unset: unset }),
          },
        )
        migrated++
      }
    }
  }
  return { migrated }
}
