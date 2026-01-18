'use client'
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, useField } from '@payloadcms/ui'
import GooglePlacesAutocompleteImport, {
  geocodeByPlaceId,
  getLatLng,
} from 'react-google-places-autocomplete'

// Workaround for TypeScript moduleResolution: "nodenext" with React 19
const GooglePlacesAutocomplete =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  GooglePlacesAutocompleteImport as unknown as React.ComponentType<any>

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  googleMapsApiKey: string
  path: string
}

/**
 * A custom client component that shows the Google Places Autocomplete component and
 * fills the point and geodata fields with the received data from the Google Places API.
 */
export const GeocodingFieldClient = ({
  field,
  googleMapsApiKey,
  path,
}: GeocodingFieldComponentProps) => {
  const pointFieldPath = path.replace('_googlePlacesData', '')

  const { setValue: setGeoData, value: geoData } = useField<string>({
    path,
  })
  const { setValue: setPoint } = useField<Array<number>>({ path: pointFieldPath })

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <FieldLabel label={field.label} path={path} required={field.required} />
        <FieldError path={path} />
      </div>
      <GooglePlacesAutocomplete
        apiKey={googleMapsApiKey}
        selectProps={{
          isClearable: true,
          onChange: async (geoData: unknown) => {
            if (geoData) {
              const placeId = (geoData as { value: { place_id: string } }).value.place_id
              const geocode = (await geocodeByPlaceId(placeId)).at(0)

              if (!geocode) {
                return
              }
              const latLng = await getLatLng(geocode)

              setPoint([latLng.lng, latLng.lat])
              setGeoData(geoData)
            } else {
              // reset the fields when it was cleared
              setPoint([])
              setGeoData(null)
            }
          },
          value: geoData as unknown,
        }}
      />
    </div>
  )
}
