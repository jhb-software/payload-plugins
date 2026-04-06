'use client'
/// <reference types="google.maps" />
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, ReactSelect, useField } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

type SelectOption = { label: string; value: unknown }

interface PlaceOptionValue {
  description: string
  mainText: string
  placeId: string
  secondaryText: string
}

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  googleMapsApiKey: string
  path: string
}

// Module-level singleton for the Google Maps API loading
let mapsLoadPromise: null | Promise<void> = null

function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (mapsLoadPromise) {
    return mapsLoadPromise
  }

  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') {
    mapsLoadPromise = google.maps.importLibrary('places').then(() => {})
    return mapsLoadPromise
  }

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    // Set up bootstrap loader stub so importLibrary is available after load
    const w = window as unknown as { google: { maps: Record<string, unknown> } }
    const g = w.google || (w.google = {} as { maps: Record<string, unknown> })
    g.maps || (g.maps = {})

    const script = document.createElement('script')
    const params = new URLSearchParams({
      callback: '__gmcb',
      key: apiKey,
      libraries: 'places',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__gmcb = () => {
      resolve()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__gmcb
    }
    script.onerror = () => {
      mapsLoadPromise = null
      reject(new Error('Failed to load Google Maps API'))
    }
    document.head.appendChild(script)
  })

  return mapsLoadPromise
}

/**
 * A custom client component that shows a Google Places Autocomplete dropdown and
 * fills the point and geodata fields with the received data from the Google Places API.
 *
 * Uses the new AutocompleteSuggestion API and Payload's ReactSelect component.
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

  const [options, setOptions] = useState<SelectOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    let cancelled = false
    loadGoogleMapsPlaces(googleMapsApiKey)
      .then(() => {
        if (!cancelled) {
          setApiReady(true)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load Google Maps')
        }
      })
    return () => {
      cancelled = true
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [googleMapsApiKey])

  const handleInputChange = useCallback(
    (inputValue: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      if (!inputValue || inputValue.length < 2 || !apiReady) {
        setOptions([])
        setIsLoading(false)
        return
      }

      debounceRef.current = setTimeout(async () => {
        setIsLoading(true)
        try {
          if (!sessionTokenRef.current) {
            sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
          }

          const { suggestions } =
            await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: inputValue,
              sessionToken: sessionTokenRef.current,
            })

          const filtered = suggestions.filter((s) => s.placePrediction != null)
          setOptions(
            filtered.map((s) => ({
              label: s.placePrediction!.text.text,
              value: {
                description: s.placePrediction!.text.text,
                mainText: s.placePrediction!.mainText?.text ?? '',
                placeId: s.placePrediction!.placeId,
                secondaryText: s.placePrediction!.secondaryText?.text ?? '',
              } satisfies PlaceOptionValue,
            })),
          )
        } catch {
          setOptions([])
        } finally {
          setIsLoading(false)
        }
      }, 300)
    },
    [apiReady],
  )

  const handleChange = useCallback(
    (option: null | SelectOption | SelectOption[]) => {
      if (!option || Array.isArray(option)) {
        setPoint([])
        setGeoData(null)
        return
      }

      const placeData = option.value as PlaceOptionValue

      const place = new google.maps.places.Place({ id: placeData.placeId })
      // sessionToken is supported at runtime but missing from @types/google.maps
      place
        .fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
          sessionToken: sessionTokenRef.current,
        } as { sessionToken: unknown } & google.maps.places.FetchFieldsRequest)
        .then(() => {
          // Reset session token after fetchFields (per Google billing best practice)
          sessionTokenRef.current = null

          if (place.location) {
            setPoint([place.location.lng(), place.location.lat()])
            setGeoData({
              label: place.formattedAddress ?? place.displayName,
              value: {
                description: place.formattedAddress,
                place_id: placeData.placeId,
                structured_formatting: {
                  main_text: place.displayName,
                },
              },
            })
          }
        })
        .catch(() => {
          setError('Failed to fetch place details')
        })
    },
    [setGeoData, setPoint],
  )

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <FieldLabel label={field.label} path={path} required={field.required} />
        <FieldError path={path} />
      </div>
      {error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : (
        <ReactSelect
          isClearable
          isLoading={isLoading}
          isSearchable
          onChange={(val) => handleChange(val as null | SelectOption)}
          onInputChange={handleInputChange}
          options={options}
          placeholder="Search for a place..."
          value={geoData as unknown as SelectOption}
        />
      )}
    </div>
  )
}
