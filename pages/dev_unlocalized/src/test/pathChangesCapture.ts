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

/** Consumer-side wiring: records what `pathChanges` reports for each write. */
export const recordPathChangesAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    records.push({ changes: await pathChanges(args) })
  } catch (error) {
    records.push({ error })
  }
  return args.doc
}

/** The `afterDelete` counterpart of {@link recordPathChangesAfterChange}. */
export const recordPathChangesAfterDelete: CollectionAfterDeleteHook = async (args) => {
  try {
    records.push({ changes: await pathChanges(args) })
  } catch (error) {
    records.push({ error })
  }
}
