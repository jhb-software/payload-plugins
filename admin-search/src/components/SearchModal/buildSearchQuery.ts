import type { Where } from 'payload'

const SEARCH_RESULTS_LIMIT = 5

export { SEARCH_RESULTS_LIMIT }

/**
 * Builds the query the search modal sends to the search collection. The base filter and the
 * typed query are combined with `and`, so results always stay inside the filter's scope —
 * including when nothing has been typed yet.
 */
export const buildSearchQuery = ({
  baseFilter,
  query,
}: {
  baseFilter?: Where
  query?: string
}): { depth: number; limit: number; sort: string; where?: Where } => {
  const constraints: Where[] = [
    ...(query ? [{ title: { like: query } }] : []),
    ...(baseFilter && Object.keys(baseFilter).length > 0 ? [baseFilter] : []),
  ]

  return {
    depth: 0,
    limit: SEARCH_RESULTS_LIMIT,
    sort: '-priority',
    ...(constraints.length > 0 && { where: { and: constraints } }),
  }
}
