'use client'
import { FieldError, FieldLabel, useField } from '@payloadcms/ui'
import GooglePlacesAutocomplete, {
  geocodeByPlaceId,
  getLatLng,
} from 'react-google-places-autocomplete'

interface GeocodingFieldComponentProps {
  field: any
  path: string
  googleMapsApiKey: string
}

/**
 * A custom client component that shows the Google Places Autocomplete component and
 * fills the point and geodata fields with the received data from the Google Places API.
 */
export const GeocodingFieldComponent = ({
  field,
  path,
  googleMapsApiKey,
}: GeocodingFieldComponentProps) => {
  const pointFieldPath = path.replace('_googlePlacesData', '')

  const { value: geoData, setValue: setGeoData } = useField<string>({
    path: path,
  })
  const { setValue: setPoint } = useField<Array<number>>({ path: pointFieldPath })

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <FieldLabel path={path} label={field.label} required={field.required} />
        <FieldError path={path} />
      </div>
      <GooglePlacesAutocomplete
        apiKey={googleMapsApiKey}
        selectProps={{
          value: geoData as any,
          isClearable: true,
          onChange: async (geoData: any) => {
            if (geoData) {
              const placeId = geoData?.value.place_id
              const geocode = (await geocodeByPlaceId(placeId)).at(0)

              if (!geocode) return
              const latLng = await getLatLng(geocode)

              setPoint([latLng.lng, latLng.lat])
              setGeoData(geoData)
            } else {
              // reset the fields when it was cleared
              setPoint([])
              setGeoData(null)
            }
          },
        }}
      />
    </div>
  )
}
