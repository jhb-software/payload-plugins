import type { PayloadRequest } from 'payload'

/** Access function for the geocoding endpoint. */
export type GeocodingEndpointAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

/** Configuration options for the geocoding plugin. */
export type GeocodingPluginConfig = {
  /** Whether the geocoding plugin is enabled. */
  enabled?: boolean
  /** Configuration for the server-side geocoding search endpoint (GET /api/geocoding-plugin/search). */
  geocodingEndpoint?: {
    /**
     * Custom access function to control who can use the geocoding endpoint.
     * Receives the Payload request object. Return true to allow access.
     * Defaults to requiring an authenticated user (i.e. `req.user` must be truthy).
     */
    access?: GeocodingEndpointAccess
  }
  /** Google Maps API key for geocoding functionality. */
  googleMapsApiKey: string
}
