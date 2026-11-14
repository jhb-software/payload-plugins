import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { pathChanges, type PathChange } from '@jhb.software/payload-pages-plugin'

type RecordedCall = { changes: PathChange[] } | { error: unknown }

let records: RecordedCall[] = []

export const clearPathChangeRecords = () => {
  records = []
}

/** Every path change reported across all recorded `pathChanges` calls, in call order. */
export const recordedPathChanges = (): PathChange[] =>
  records.flatMap((record) => ('changes' in record ? record.changes : []))

/** The rejections `pathChanges` produced, in call order. */
export const recordedPathChangeErrors = (): unknown[] =>
  records
    .filter((record) => 'error' in record)
    .map((record) => (record as { error: unknown }).error)

/**
 * The consumer-side wiring the plugin README describes: an `afterChange` hook which asks
 * `pathChanges` what the write did to the collection's live paths. Records the result so tests
 * can assert it, and logs each change the way the dev app demonstrates invalidation.
 */
export const recordPathChangesAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    const changes = await pathChanges(args)
    for (const change of changes) {
      args.req.payload.logger.info(
        `[path-index] ${args.collection.slug} ${String(change.id)}: ${change.previousPath ?? 'null'} → ${change.path ?? 'null'}`,
      )
    }
    records.push({ changes })
  } catch (error) {
    records.push({ error })
  }
  return args.doc
}

/** The `afterDelete` counterpart of {@link recordPathChangesAfterChange}. */
export const recordPathChangesAfterDelete: CollectionAfterDeleteHook = async (args) => {
  try {
    const changes = await pathChanges(args)
    for (const change of changes) {
      args.req.payload.logger.info(
        `[path-index] ${args.collection.slug} ${String(change.id)}: ${change.previousPath ?? 'null'} → ${change.path ?? 'null'}`,
      )
    }
    records.push({ changes })
  } catch (error) {
    records.push({ error })
  }
}
