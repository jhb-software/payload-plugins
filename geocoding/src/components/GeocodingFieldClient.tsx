'use client'
/// <reference types="google.maps" />
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, ReactSelect, useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { loadGoogleMapsPlaces } from './loadGoogleMapsPlaces.js'

type SelectOption = { label: string; value: unknown }

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  googleMapsApiKey: string
  path: string
}

export const GeocodingFieldClient = ({
  field,
  googleMapsApiKey,
  path,
}: GeocodingFieldComponentProps) => {
  const pointFieldPath = path.replace('_googlePlacesData', '')

  const { setValue: setGeoData, value: geoData } = useField<string>({ path })
  const { setValue: setPoint } = useField<Array<number>>({ path: pointFieldPath })

  const [options, setOptions] = useState<SelectOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    let cancelled = false
    loadGoogleMapsPlaces(googleMapsApiKey).catch((e) => {
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

  const handleInputChange = (inputValue: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    if (!inputValue || inputValue.length < 2) {
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

        setOptions(
          suggestions
            .filter((s) => s.placePrediction != null)
            .map((s) => ({
              label: s.placePrediction!.text.text,
              value: s.placePrediction!.placeId,
            })),
        )
      } catch {
        setOptions([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }

  const handleChange = (option: null | SelectOption | SelectOption[]) => {
    if (!option || Array.isArray(option)) {
      setPoint([])
      setGeoData(null)
      return
    }

    const placeId = option.value as string
    new google.maps.places.Place({ id: placeId })
      .fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
        sessionToken: sessionTokenRef.current,
      } as { sessionToken: unknown } & google.maps.places.FetchFieldsRequest)
      .then(({ place }) => {
        sessionTokenRef.current = null
        if (place.location) {
          setPoint([place.location.lng(), place.location.lat()])
          setGeoData({
            label: place.formattedAddress ?? place.displayName,
            value: {
              description: place.formattedAddress,
              place_id: placeId,
              structured_formatting: { main_text: place.displayName },
            },
          })
        }
      })
      .catch(() => setError('Failed to fetch place details'))
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
