'use client'
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, ReactSelect, useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

type SelectOption = { label: string; value: unknown }

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  googleMapsApiKey: string
  path: string
}

/**
 * Loads the Google Maps Places library using the bootstrap loader.
 */
async function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') {
    await google.maps.importLibrary('places')
    return
  }

  // Set up the bootstrap loader stub before loading the script
  const w = window as unknown as { google: { maps: Record<string, unknown> } }
  const g = w.google || (w.google = {} as { maps: Record<string, unknown> })
  const m = g.maps || (g.maps = {})

  const libraries = new Set<string>()
  let loadPromise: Promise<void> | null = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(m as any).importLibrary = (name: string) => {
    libraries.add(name)
    if (!loadPromise) {
      loadPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        const params = new URLSearchParams({
          callback: '__gmcb',
          key: apiKey,
          libraries: [...libraries].join(','),
        })
        script.src = `https://maps.googleapis.com/maps/api/js?${params}`
        script.async = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__gmcb = () => {
          resolve()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any).__gmcb
        }
        script.onerror = () => reject(new Error('Failed to load Google Maps API'))
        document.head.appendChild(script)
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return loadPromise.then(() => (google.maps as any).importLibrary(name))
  }

  await google.maps.importLibrary('places')
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
  const [error, setError] = useState<string | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadGoogleMapsPlaces(googleMapsApiKey)
      .then(() => setApiReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load Google Maps'))
  }, [googleMapsApiKey])

  const handleInputChange = (inputValue: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!inputValue || inputValue.length < 2 || !apiReady) {
      setOptions([])
      return
    }

    setIsLoading(true)

    debounceRef.current = setTimeout(async () => {
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
        }

        const { suggestions } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: inputValue,
            sessionToken: sessionTokenRef.current,
          })

        setOptions(
          suggestions
            .filter((s) => s.placePrediction)
            .map((s) => ({
              label: s.placePrediction!.text.text,
              value: {
                description: s.placePrediction!.text.text,
                mainText: s.placePrediction!.mainText?.text,
                placeId: s.placePrediction!.placeId,
                secondaryText: s.placePrediction!.secondaryText?.text,
                toPlace: () => s.placePrediction!.toPlace(),
              },
            })),
        )
      } catch {
        setOptions([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }

  const handleChange = async (option: SelectOption | SelectOption[] | null | undefined) => {
    if (!option || Array.isArray(option)) {
      setPoint([])
      setGeoData(null)
      return
    }

    const placeData = option.value as {
      description: string
      mainText: string
      placeId: string
      toPlace: () => google.maps.places.Place
    }

    try {
      const place = placeData.toPlace()
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
        sessionToken: sessionTokenRef.current!,
      })

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
    } catch {
      setError('Failed to fetch place details')
    }
  }

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
          onChange={(val) => handleChange(val as SelectOption | null)}
          onInputChange={handleInputChange}
          options={options}
          placeholder="Search for a place..."
          value={geoData as unknown as SelectOption}
        />
      )}
    </div>
  )
}
