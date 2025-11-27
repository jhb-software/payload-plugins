import type { ClientComponentProps, FieldPaths, ServerComponentProps } from 'payload'

import React from 'react'

import { GeocodingFieldClient } from './GeocodingFieldClient.js'

/**
 * Geocoding field component that reads the Google Maps API key from the Payload config and passes it to the `GeocodingFieldClient` component.
 */
export const GeocodingField: React.FC<
  ClientComponentProps & Pick<FieldPaths, 'path'> & ServerComponentProps
> = ({ clientField, path, payload }) => {
  const googleMapsApiKey = payload.config.custom?.payloadGeocodingPlugin?.googleMapsApiKey

  if (!googleMapsApiKey || typeof googleMapsApiKey !== 'string') {
    throw new Error(
      'Geocoding plugin API key not configured. Ensure payloadGeocodingPlugin is added to your Payload config with a googleMapsApiKey.',
    )
  }

  return (
    <GeocodingFieldClient field={clientField} googleMapsApiKey={googleMapsApiKey} path={path} />
  )
}
