/**
 * Migration script for @jhb.software/payload-geocoding-plugin v0.3.0
 *
 * This migration handles:
 * 1. Renaming `_googlePlacesData` fields to `_meta`
 * 2. Transforming the stored data shape from the old react-google-places-autocomplete
 *    format to the new flat format
 *
 * Old format (v0.2.x):
 *   { label: string, value: { description: string, place_id: string, structured_formatting: { main_text: string } } }
 *
 * New format (v0.3.0):
 *   { displayName: string, formattedAddress: string, googlePlaceId: string }
 *
 * Usage:
 *   1. Copy this file into your project
 *   2. Update COLLECTIONS_TO_MIGRATE with your collection slugs and point field names
 *   3. Run with: npx tsx migrations/migrate-to-0.3.0.ts
 *
 * Alternatively, integrate the `migrateCollection` function into a Payload migration.
 */

import type { BasePayload, CollectionSlug } from 'payload'

// =====================================================================
// CONFIGURE THESE: Add your collection slugs and point field names
// =====================================================================
const COLLECTIONS_TO_MIGRATE: { collection: CollectionSlug; pointFieldName: string }[] = [
  // Example:
  // { collection: 'pages', pointFieldName: 'location' },
  // { collection: 'events', pointFieldName: 'venue' },
]

interface OldGeoData {
  label?: string
  value?: {
    description?: string
    place_id?: string
    structured_formatting?: {
      main_text?: string
    }
  }
}

interface NewLocationMeta {
  formattedAddress: string
  googlePlaceId: string
  name: string
  types: string[]
}

function transformGeoData(old: OldGeoData): NewLocationMeta | null {
  if (!old?.value?.place_id) {
    return null
  }

  return {
    formattedAddress: old.value.description ?? old.label ?? '',
    googlePlaceId: old.value.place_id,
    name: old.value.structured_formatting?.main_text ?? old.value.description ?? '',
    types: [], // types were not stored in the old format
  }
}

export async function migrateCollection(
  payload: BasePayload,
  collection: CollectionSlug,
  pointFieldName: string,
): Promise<{ migrated: number; skipped: number }> {
  const oldFieldName = `${pointFieldName}_googlePlacesData`
  const newFieldName = `${pointFieldName}_meta`

  let migrated = 0
  let skipped = 0
  let hasMore = true
  let page = 1

  while (hasMore) {
    const result = await payload.find({
      collection,
      depth: 0,
      limit: 100,
      page,
      select: { [oldFieldName]: true },
      where: {
        [oldFieldName]: { exists: true },
      },
    })

    for (const doc of result.docs) {
      const oldData = (doc as Record<string, unknown>)[oldFieldName] as OldGeoData | undefined
      if (!oldData) {
        skipped++
        continue
      }

      const newData = transformGeoData(oldData)
      if (!newData) {
        skipped++
        continue
      }

      await payload.update({
        id: doc.id,
        collection,
        data: { [newFieldName]: newData },
      })

      migrated++
    }

    hasMore = result.hasNextPage
    page++
  }

  return { migrated, skipped }
}

/**
 * Run this script standalone with: npx tsx migrations/migrate-to-0.3.0.ts
 */
async function main() {
  if (COLLECTIONS_TO_MIGRATE.length === 0) {
    console.error('No collections configured. Edit COLLECTIONS_TO_MIGRATE in this file.')
    process.exit(1)
  }

  // Import your Payload config — adjust the path as needed
  const { getPayload } = await import('payload')

  const payload = await getPayload({
    // Adjust this import path to point to your payload.config.ts
    config: (await import('../payload.config')).default,
  })

  for (const { collection, pointFieldName } of COLLECTIONS_TO_MIGRATE) {
    console.log(`Migrating ${collection}.${pointFieldName}...`)
    const result = await migrateCollection(payload, collection, pointFieldName)
    console.log(`  Done: ${result.migrated} migrated, ${result.skipped} skipped`)
  }

  console.log('Migration complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
