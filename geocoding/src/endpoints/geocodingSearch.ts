import type { Endpoint } from 'payload'

import type { GeocodingEndpointAccess } from '../types/GeoCodingPluginConfig.js'

import { PLUGIN_SLUG } from '../constants.js'
import { geocode } from '../geocode.js'

const STATUS = {
  denied: 502,
  imprecise: 422,
  invalid_request: 400,
  no_results: 200,
  not_configured: 501,
  quota: 503,
  unavailable: 503,
} as const

const USAGE =
  'Send the address as `q`, e.g. GET /api/geocoding/search?q=Alexanderplatz+1,+Berlin&country=DE. `country` (ISO 3166-1 alpha-2) and `language` are optional.'

/**
 * `GET /api/geocoding/search?q=<address>&country=<ISO code>&language=<code>` geocodes an address
 * server-side, for agents and API consumers that cannot use the admin autocomplete.
 *
 * Answers `{ results }` (best match first). An address that matches nothing answers
 * `{ results: [], message }`; other failures answer an error status with `{ errors, reason }`.
 */
export const createGeocodingSearchEndpoint = (options: {
  access?: GeocodingEndpointAccess
}): Endpoint => ({
  handler: async (req) => {
    const hasAccess = options.access ? await options.access({ req }) : Boolean(req.user)
    if (!hasAccess) {
      return Response.json(
        { errors: [{ message: 'Log in, or call with an API key the access option allows.' }] },
        { status: 401 },
      )
    }

    const params = new URL(req.url ?? '', 'http://localhost').searchParams
    const address = params.get('q')?.trim()
    if (!address) {
      return Response.json(
        { errors: [{ message: `The query parameter "q" is missing. ${USAGE}` }] },
        { status: 400 },
      )
    }

    const outcome = await geocode({
      address,
      country: params.get('country') ?? undefined,
      language: params.get('language') ?? undefined,
      req,
    })

    if (outcome.ok) {
      return Response.json({ results: outcome.results })
    }
    if (outcome.reason === 'no_results') {
      return Response.json({ message: outcome.message, results: [] })
    }
    return Response.json(
      { errors: [{ message: outcome.message }], reason: outcome.reason },
      { status: STATUS[outcome.reason] },
    )
  },
  method: 'get',
  path: `/${PLUGIN_SLUG}/search`,
})
