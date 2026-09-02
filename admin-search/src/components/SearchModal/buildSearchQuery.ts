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
 * A constraint no document can satisfy: every document has an id. Used when the scope a
 * configured filter would have applied is unknown, so that the query itself is scoped out
 * rather than relying on the request never being sent.
 */
const MATCHES_NOTHING: Where = { id: { exists: false } }

/**
 * Builds the query the search modal sends to the search collection. The base filter and the
 * typed query are combined with `and`, so results always stay inside the filter's scope —
 * including when nothing has been typed yet.
 *
 * A filter that could not be evaluated yields a query that matches nothing. `buildSearchURL`
 * already stops the request from going out at all; this is the second of the two, so that a
 * query which does reach the API still cannot answer with documents outside the scope.
 */
export const buildSearchQuery = ({
  baseFilter,
  query,
}: {
  baseFilter: BaseFilterState
  query?: string
}): { depth: number; limit: number; sort: string; where?: Where } => {
  const filter = baseFilter.status === 'resolved' ? baseFilter.filter : MATCHES_NOTHING

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
