import type { ClientComponentProps, FieldPaths, ServerComponentProps } from 'payload'

import React from 'react'

import { getPluginCustom } from '../pluginCustom.js'
import { GeocodingFieldClient } from './GeocodingFieldClient.js'

/**
 * Geocoding field component that reads the Google Maps API key from the Payload config and passes it to the `GeocodingFieldClient` component.
 */
export const GeocodingField: React.FC<
  ClientComponentProps & Pick<FieldPaths, 'path'> & ServerComponentProps
> = ({ clientField, path, payload }) => {
  const googleMapsApiKey = getPluginCustom(payload.config)?.googleMapsApiKey

  if (!googleMapsApiKey) {
    throw new Error(
      'The geocoding field needs a Google Maps API key for its address autocomplete. Pass googleMapsApiKey to payloadGeocodingPlugin.',
    )
  }

  return (
    <GeocodingFieldClient field={clientField} googleMapsApiKey={googleMapsApiKey} path={path} />
  )
}
