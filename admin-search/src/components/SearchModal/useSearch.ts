'use client'

import { getTranslation } from '@payloadcms/translations'
import {
  useConfig,
  useDebounce,
  useEntityVisibility,
  usePayloadAPI,
  useTranslation,
} from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SearchResult, SearchResultDocument } from '../../types/SearchResult.js'

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_RESULTS_LIMIT = 5

export interface UseSearchReturn {
  displayedQuery: string
  isError: boolean
  isLoading: boolean
  query: string
  results: SearchResult[]
  resultsLimit: number
  setQuery: (query: string) => void
}

export const useSearch = (): UseSearchReturn => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [displayedQuery, setDisplayedQuery] = useState('')
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)

  const { i18n } = useTranslation()
  const { config } = useConfig()
  const { visibleEntities } = useEntityVisibility()
  const requestNonceRef = useRef(0)

  const entityLabels = useMemo(() => {
    const collections: Record<string, { plural: string; singular: string }> = {}
    const globals: Record<string, string> = {}

    config.collections.forEach((c) => {
      collections[c.slug] = {
        plural: getTranslation(c.labels?.plural || c.slug, i18n),
        singular: getTranslation(c.labels?.singular || c.slug, i18n),
      }
    })

    config.globals.forEach((g) => {
      globals[g.slug] = getTranslation(g.label || g.slug, i18n)
    })

    return { collections, globals }
  }, [config.collections, config.globals, i18n])

  const [{ data, isError, isLoading }, { setParams }] = usePayloadAPI(
    `${config.routes.api}/search`,
    {
      initialParams: {
        depth: 0,
        limit: 10,
        pagination: false,
        sort: '-priority',
      },
    },
  )

  const getSearchParams = useCallback(
    (searchQuery?: string) => ({
      depth: 0,
      limit: SEARCH_RESULTS_LIMIT,
      sort: '-priority',
      ...(searchQuery && {
        where: {
          title: {
            like: searchQuery,
          },
        },
      }),
    }),
    [],
  )

  const triggerSearch = useCallback(
    (searchQuery?: string) => {
      requestNonceRef.current += 1
      const baseParams = getSearchParams(searchQuery)
      const paramsWithNonce = { ...baseParams, __nonce: requestNonceRef.current, __ts: Date.now() }
      setParams(paramsWithNonce)
    },
    [getSearchParams, setParams],
  )

  const filterCollectionsAndGlobals = useCallback(
    (searchQuery: string): SearchResult[] => {
      if (!searchQuery || searchQuery.trim().length < 2) {
        return []
      }

      const lowerQuery = searchQuery.toLowerCase()
      const matches = (text: string) => text.toLowerCase().includes(lowerQuery)
      const results: SearchResult[] = []

      for (const [slug, labels] of Object.entries(entityLabels.collections)) {
        if (
          visibleEntities.collections.includes(slug) &&
          (matches(slug) || matches(labels.singular) || matches(labels.plural))
        ) {
          results.push({ id: `collection-${slug}`, slug, type: 'collection', label: labels.plural })
        }
      }

      for (const [slug, label] of Object.entries(entityLabels.globals)) {
        if (visibleEntities.globals.includes(slug) && (matches(slug) || matches(label))) {
          results.push({ id: `global-${slug}`, slug, type: 'global', label })
        }
      }

      return results
    },
    [entityLabels, visibleEntities],
  )

  useEffect(() => {
    triggerSearch(debouncedQuery || undefined)
  }, [debouncedQuery, triggerSearch])

  const prevDataRef = useRef(data)
  useEffect(() => {
    // Only update results when data actually changes (not when debouncedQuery changes)
    if (data !== prevDataRef.current && data?.docs && Array.isArray(data.docs)) {
      prevDataRef.current = data

      const documentResults: SearchResult[] = (data.docs as SearchResultDocument[]).map((doc) => ({
        ...doc,
        type: 'document' as const,
      }))

      const collectionGlobalResults = debouncedQuery
        ? filterCollectionsAndGlobals(debouncedQuery)
        : []

      setResults([...collectionGlobalResults, ...documentResults])
      setDisplayedQuery(debouncedQuery)
    }
  }, [data, debouncedQuery, filterCollectionsAndGlobals])

  return {
    displayedQuery,
    isError,
    isLoading,
    query,
    results,
    resultsLimit: SEARCH_RESULTS_LIMIT,
    setQuery,
  }
}
