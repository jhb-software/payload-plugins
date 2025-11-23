'use client'

import { getTranslation } from '@payloadcms/translations'
import {
  Banner,
  SearchIcon,
  useConfig,
  useDebounce,
  useEntityVisibility,
  usePayloadAPI,
  useTranslation,
} from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import { formatAdminURL } from 'payload/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SearchResult, SearchResultDocument } from '../../types/SearchResult.js'

import { SearchModalSkeleton } from './SearchModalSkeleton.js'
import { SearchResultItem } from './SearchResultItem.js'
import './SearchModal.css'

interface SearchModalProps {
  handleClose: () => void
}

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_RESULTS_LIMIT = 5

export const SearchModal: React.FC<SearchModalProps> = ({ handleClose }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)
  const { i18n } = useTranslation()
  const { config } = useConfig()
  const {
    routes: { admin, api },
  } = config
  const router = useRouter()
  const { visibleEntities } = useEntityVisibility()

  const collectionLabelsMap = useMemo(() => {
    const map: Record<string, { plural: string; singular: string; slug: string }> = {}
    config.collections.forEach((collection) => {
      map[collection.slug] = {
        slug: collection.slug,
        plural: getTranslation(collection.labels?.plural || collection.slug, i18n),
        singular: getTranslation(collection.labels?.singular || collection.slug, i18n),
      }
    })
    return map
  }, [config.collections, i18n])

  const globalLabelsMap = useMemo(() => {
    const map: Record<string, { label: string; slug: string }> = {}
    config.globals.forEach((global) => {
      map[global.slug] = {
        slug: global.slug,
        label: getTranslation(global.label || global.slug, i18n),
      }
    })
    return map
  }, [config.globals, i18n])

  const [{ data, isError, isLoading }, { setParams }] = usePayloadAPI(`${api}/search`, {
    initialParams: {
      depth: 0,
      limit: 10,
      pagination: false,
      sort: '-priority',
    },
  })
  const resultsRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestNonceRef = useRef(0)

  const getSearchParams = useCallback(
    (searchQuery?: string) => ({
      depth: 1,
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
      if (!searchQuery || searchQuery.trim().length < 2) {return []}

      const lowerQuery = searchQuery.toLowerCase()
      const results: SearchResult[] = []

      // Only include collections that are visible to the current user
      for (const [slug, labels] of Object.entries(collectionLabelsMap)) {
        if (
          visibleEntities.collections.includes(slug) &&
          (slug.toLowerCase().includes(lowerQuery) ||
            labels.singular.toLowerCase().includes(lowerQuery) ||
            labels.plural.toLowerCase().includes(lowerQuery))
        ) {
          results.push({
            id: `collection-${slug}`,
            slug,
            type: 'collection',
            label: labels.plural,
          })
        }
      }

      // Only include globals that are visible to the current user
      for (const [slug, globalInfo] of Object.entries(globalLabelsMap)) {
        if (
          visibleEntities.globals.includes(slug) &&
          (slug.toLowerCase().includes(lowerQuery) ||
            globalInfo.label.toLowerCase().includes(lowerQuery))
        ) {
          results.push({
            id: `global-${slug}`,
            slug,
            type: 'global',
            label: globalInfo.label,
          })
        }
      }

      return results
    },
    [collectionLabelsMap, globalLabelsMap, visibleEntities],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    triggerSearch()
  }, [triggerSearch])

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([])
      setSelectedIndex(-1)
      return
    }

    triggerSearch(debouncedQuery)
  }, [debouncedQuery, triggerSearch])

  useEffect(() => {
    if (data?.docs && Array.isArray(data.docs)) {
      const documentResults: SearchResult[] = (data.docs as SearchResultDocument[]).map((doc) => ({
        ...doc,
        type: 'document' as const,
      }))

      const collectionGlobalResults = debouncedQuery
        ? filterCollectionsAndGlobals(debouncedQuery)
        : []

      const mergedResults = [...collectionGlobalResults, ...documentResults]

      setResults(mergedResults)
      setSelectedIndex(-1)
    }
  }, [data, debouncedQuery, filterCollectionsAndGlobals])

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      if (result.type === 'document') {
        const { relationTo, value } = result.doc
        router.push(
          formatAdminURL({
            adminRoute: admin,
            path: `/collections/${relationTo}/${value}`,
          }),
        )
      } else if (result.type === 'collection') {
        router.push(
          formatAdminURL({
            adminRoute: admin,
            path: `/collections/${result.slug}`,
          }),
        )
      } else if (result.type === 'global') {
        router.push(
          formatAdminURL({
            adminRoute: admin,
            path: `/globals/${result.slug}`,
          }),
        )
      }
      handleClose()
    },
    [router, admin, handleClose],
  )

  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0))
      } else if (e.key === 'Enter' && selectedIndex !== -1) {
        e.preventDefault()
        handleResultClick(results[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    },
    [results, selectedIndex, handleResultClick, handleClose],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement && e.key !== 'Escape') {
        return
      }
      handleKeyboardNavigation(e)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyboardNavigation])



  useEffect(() => {
    if (selectedIndex !== -1 && resultsRef.current) {
      const selectedItem = resultsRef.current.children[selectedIndex]
      if (selectedItem instanceof HTMLLIElement) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])


  return (
    <div
      aria-label="Close search modal"
      className="search-modal__overlay"
      onClick={handleClose}
      onKeyDown={(e) => e.key === 'Enter' && handleClose()}
      role="button"
      tabIndex={0}
    >
      <div
        aria-label="Search modal content"
        className="search-modal__content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
      >
        <div className="search-modal__header">
          <div className="search-modal__input-wrapper">
            <span className="search-modal__search-icon">
              <SearchIcon />
            </span>
            <input
              aria-label="Search for documents"
              className="search-modal__input-field"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && results.length > 0) {
                  handleKeyboardNavigation(e)
                } else if (e.key === 'Enter' && selectedIndex !== -1) {
                  e.preventDefault()
                  handleResultClick(results[selectedIndex])
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  handleClose()
                }
              }}
              placeholder="Search..."
              ref={inputRef}
              type="text"
              value={query}
            />
            <span className="search-modal__escape-hint">ESC</span>
          </div>
        </div>

        <div className="search-modal__results-container">
          {isLoading && <SearchModalSkeleton count={SEARCH_RESULTS_LIMIT} />}
          {isError && (
            <Banner type="error">An error occurred while searching. Please try again.</Banner>
          )}
          {!isLoading && !isError && results.length === 0 && debouncedQuery && (
            <div className="search-modal__no-results-message">
              <p>No results found for "{debouncedQuery}"</p>
              <p className="search-modal__no-results-hint">
                Try different keywords or check your spelling
              </p>
            </div>
          )}
          {!isLoading && !isError && results.length > 0 && (
            <ul className="search-modal__results-list" ref={resultsRef}>
              {results.map((result, index) => (
                <SearchResultItem
                  index={index}
                  key={result.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onResultClick={handleResultClick}
                  query={query}
                  result={result}
                  selectedIndex={selectedIndex}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="search-modal__footer">
          <div className="search-modal__keyboard-shortcuts">
            <div className="search-modal__shortcut-item">
              <span className="search-modal__shortcut-key">↑↓</span>
              <span className="search-modal__shortcut-description">to navigate</span>
            </div>
            <div className="search-modal__shortcut-item">
              <span className="search-modal__shortcut-key">↵</span>
              <span className="search-modal__shortcut-description">to select</span>
            </div>
            <div className="search-modal__shortcut-item">
              <span className="search-modal__shortcut-key">ESC</span>
              <span className="search-modal__shortcut-description">to close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
