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
  // Without a browser key (e.g. a project geocoding only server-side), the field renders read-only.
  const googleMapsApiKey = getPluginCustom(payload.config)?.googleMapsApiKey

  return (
    <GeocodingFieldClient field={clientField} googleMapsApiKey={googleMapsApiKey} path={path} />
  )
}
