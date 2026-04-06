'use client'
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, useField } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  googleMapsApiKey: string
  path: string
}

/**
 * Loads the Google Maps JS API script if not already present.
 * Returns a promise that resolves when the API is ready.
 */
function loadGoogleMapsApi(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') {
      resolve()
      return
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve())
      existingScript.addEventListener('error', () =>
        reject(new Error('Failed to load Google Maps API')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps API'))
    document.head.appendChild(script)
  })
}

/**
 * A custom client component that shows the Google Places Autocomplete component and
 * fills the point and geodata fields with the received data from the Google Places API.
 *
 * Uses the new PlaceAutocompleteElement (google.maps.places) instead of the deprecated
 * AutocompleteService.
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

  const containerRef = useRef<HTMLDivElement>(null)
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null)
  const [error, setError] = useState<null | string>(null)

  const handlePlaceSelect = useCallback(
    async (event: Event) => {
      const placeEvent = event as google.maps.places.PlaceAutocompletePlaceSelectEvent
      const place = placeEvent.place

      if (!place) {
        return
      }

      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      })

      if (place.location) {
        setPoint([place.location.lng(), place.location.lat()])
        setGeoData({
          label: place.formattedAddress ?? place.displayName,
          value: {
            description: place.formattedAddress,
            place_id: place.id,
            structured_formatting: {
              main_text: place.displayName,
            },
          },
        })
      }
    },
    [setGeoData, setPoint],
  )

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        await loadGoogleMapsApi(googleMapsApiKey)
        if (cancelled || !containerRef.current) {
          return
        }

        await google.maps.importLibrary('places')
        if (cancelled || !containerRef.current) {
          return
        }

        // Don't re-create if already initialized
        if (autocompleteRef.current) {
          return
        }

        const autocomplete = new google.maps.places.PlaceAutocompleteElement({})
        autocompleteRef.current = autocomplete

        // Style the input to fill the container
        autocomplete.style.width = '100%'

        autocomplete.addEventListener('gmp-placeselect', handlePlaceSelect)

        containerRef.current.appendChild(autocomplete)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load Google Maps')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      if (autocompleteRef.current) {
        autocompleteRef.current.removeEventListener('gmp-placeselect', handlePlaceSelect)
      }
    }
  }, [googleMapsApiKey, handlePlaceSelect])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <FieldLabel label={field.label} path={path} required={field.required} />
        <FieldError path={path} />
      </div>
      {error ? <div style={{ color: 'red' }}>{error}</div> : <div ref={containerRef} />}
      {geoData && (
        <button
          onClick={() => {
            setPoint([])
            setGeoData(null)

            // Clear the autocomplete input
            if (autocompleteRef.current) {
              const input = autocompleteRef.current.querySelector('input')
              if (input) {
                input.value = ''
              }
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--theme-elevation-500)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            marginTop: '0.25rem',
            padding: 0,
            textDecoration: 'underline',
          }}
          type="button"
        >
          Clear selection
        </button>
      )}
    </div>
  )
}
