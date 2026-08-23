import type { Where } from 'payload'

import type { BaseFilterState } from '../../types/BaseFilterState.js'

export const SEARCH_RESULTS_LIMIT = 5

/**
 * The URL the search modal queries, or an empty one when the base filter could not be
 * resolved. `usePayloadAPI` skips the request entirely for an empty URL, so an unresolvable
 * filter yields no documents at all rather than an unscoped list of them.
 */
export const buildSearchURL = ({
  apiRoute,
  baseFilter,
}: {
  apiRoute: string
  baseFilter: BaseFilterState
}): string => (baseFilter.status === 'unavailable' ? '' : `${apiRoute}/search`)

/**
 * Builds the query the search modal sends to the search collection. The base filter and the
 * typed query are combined with `and`, so results always stay inside the filter's scope —
 * including when nothing has been typed yet.
 */
export const buildSearchQuery = ({
  baseFilter,
  query,
}: {
  baseFilter: BaseFilterState
  query?: string
}): { depth: number; limit: number; sort: string; where?: Where } => {
  const filter = baseFilter.status === 'resolved' ? baseFilter.filter : undefined

  const constraints: Where[] = [
    ...(query ? [{ title: { like: query } }] : []),
    ...(filter && Object.keys(filter).length > 0 ? [filter] : []),
  ]

  return {
    depth: 0,
    limit: SEARCH_RESULTS_LIMIT,
    sort: '-priority',
    ...(constraints.length > 0 && { where: { and: constraints } }),
  }
}
