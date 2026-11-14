'use client'
/// <reference types="google.maps" />
import type { FieldBaseClient } from 'payload'

import { FieldError, FieldLabel, ReactSelect, useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { loadGoogleMapsPlaces } from './loadGoogleMapsPlaces.js'

type SelectOption = { label: string; value: unknown }

interface LocationMeta {
  formattedAddress: string
  googlePlaceId: string
  name: string
  types: string[]
}

interface GeocodingFieldComponentProps {
  field: Pick<FieldBaseClient, 'label' | 'required'>
  /** Without a key the field shows the stored place read-only instead of the address search. */
  googleMapsApiKey?: string
  path: string
}

function toSelectOption(meta: LocationMeta): SelectOption {
  const label =
    meta.name && meta.formattedAddress && !meta.formattedAddress.startsWith(meta.name)
      ? `${meta.name}, ${meta.formattedAddress}`
      : meta.formattedAddress || meta.name
  return { label, value: meta.googlePlaceId }
}

export const GeocodingFieldClient = ({
  field,
  googleMapsApiKey,
  path,
}: GeocodingFieldComponentProps) => {
  const pointFieldPath = path.endsWith('_meta') ? path.slice(0, -'_meta'.length) : path

  const { setValue: setLocationMeta, value: locationMeta } = useField<LocationMeta | null>({
    path,
  })
  const { setValue: setPoint } = useField<Array<number>>({ path: pointFieldPath })

  const [options, setOptions] = useState<SelectOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null)
  // Only the latest search may set the options: debounced requests can resolve out of order.
  const searchRef = useRef(0)
  // Loading Google Maps failed: nothing can be searched until the page reloads.
  const [loadError, setLoadError] = useState<null | string>(null)

  useEffect(() => {
    if (!googleMapsApiKey) {
      return
    }
    let cancelled = false
    loadGoogleMapsPlaces(googleMapsApiKey).catch((e) => {
      if (!cancelled) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load Google Maps')
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
      const search = ++searchRef.current
      setIsLoading(true)
      setError(null)
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
        }

        const { suggestions } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: inputValue,
            sessionToken: sessionTokenRef.current,
          })

        if (search !== searchRef.current) {
          return
        }
        setOptions(
          suggestions
            .filter((s) => s.placePrediction != null)
            .map((s) => ({
              label: s.placePrediction!.text.text,
              value: s.placePrediction!.placeId,
            })),
        )
      } catch (e) {
        if (search === searchRef.current) {
          setOptions([])
          // E.g. the Places API (New) is not enabled for the key: say so instead of "No options".
          setError(`Address search failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      } finally {
        if (search === searchRef.current) {
          setIsLoading(false)
        }
      }
    }, 300)
  }

  const handleChange = (option: null | SelectOption | SelectOption[]) => {
    if (!option || Array.isArray(option)) {
      setPoint(null)
      setLocationMeta(null)
      return
    }

    const placeId = option.value as string
    setError(null)
    new google.maps.places.Place({ id: placeId })
      .fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'types'],
        sessionToken: sessionTokenRef.current,
      } as { sessionToken: unknown } & google.maps.places.FetchFieldsRequest)
      .then(({ place }) => {
        sessionTokenRef.current = null
        if (place.location) {
          setPoint([place.location.lng(), place.location.lat()])
          const formattedAddress = place.formattedAddress ?? place.displayName ?? ''
          setLocationMeta({
            name: place.displayName ?? formattedAddress,
            formattedAddress,
            googlePlaceId: placeId,
            types: place.types ?? [],
          })
        }
      })
      .catch((e) =>
        setError(
          `Could not load the selected place, pick it again: ${e instanceof Error ? e.message : String(e)}`,
        ),
      )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <FieldLabel label={field.label} path={path} required={field.required} />
        <FieldError path={path} />
      </div>
      {!googleMapsApiKey ? (
        <div>{locationMeta ? toSelectOption(locationMeta).label : '-'}</div>
      ) : loadError ? (
        <div style={{ color: 'var(--theme-error-500)' }}>{loadError}</div>
      ) : (
        <ReactSelect
          filterOption={() => true}
          isClearable
          isLoading={isLoading}
          isSearchable
          onChange={(val) => handleChange(val as null | SelectOption)}
          onInputChange={handleInputChange}
          options={options}
          placeholder="Search for a place..."
          value={locationMeta ? toSelectOption(locationMeta) : undefined}
        />
      )}
      {error && !loadError && (
        <div style={{ color: 'var(--theme-error-500)', marginTop: 'calc(var(--base) / 4)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
