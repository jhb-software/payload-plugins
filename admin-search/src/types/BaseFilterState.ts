import type { Where } from 'payload'

/**
 * The outcome of resolving the configured `baseFilter` for the current request.
 *
 * `unavailable` is not the same as an absent filter: a filter was configured but could not be
 * evaluated, so the scope it would have applied is unknown. The search then matches nothing
 * rather than widening to every document.
 */
export type BaseFilterState = { filter?: Where; status: 'resolved' } | { status: 'unavailable' }
