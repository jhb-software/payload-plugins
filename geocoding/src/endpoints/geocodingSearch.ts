import type { Endpoint, PayloadRequest } from 'payload'

import { geocodeAddress } from '../services/googleGeocoding.js'

export type GeocodingEndpointAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

/**
 * Creates a Payload endpoint for server-side geocoding.
 * Enables agents and API consumers to geocode addresses without the browser UI.
 *
 * Usage: GET /api/geocoding-plugin/search?q=Berlin
 */
export const createGeocodingSearchEndpoint = (options: {
  access?: GeocodingEndpointAccess
  apiKey: string
}): Endpoint => ({
  handler: async (req: PayloadRequest) => {
    // Authentication: require a logged-in user by default
    const hasAccess = options.access ? await options.access({ req }) : Boolean(req.user)

    if (!hasAccess) {
      return Response.json({ errors: [{ message: 'Unauthorized' }] }, { status: 401 })
    }

    const url = new URL(req.url!)
    const query = url.searchParams.get('q')

    if (!query || query.trim() === '') {
      return Response.json(
        { errors: [{ message: 'Query parameter "q" is required' }] },
        { status: 400 },
      )
    }

    try {
      const results = await geocodeAddress(query, options.apiKey)
      return Response.json({ results })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Geocoding failed'
      return Response.json({ errors: [{ message }] }, { status: 502 })
    }
  },
  method: 'get',
  path: '/geocoding-plugin/search',
})
