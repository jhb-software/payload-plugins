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

import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchResultItem } from '../SearchResultItem/SearchResultItem.js'
import { SearchResultItemSkeleton } from '../SearchResultItem/SearchResultItemSkeleton.js'
import './SearchModal.css'

interface SearchModalProps {
  handleClose: () => void
}

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_RESULTS_LIMIT = 5

export const SearchModal: React.FC<SearchModalProps> = ({ handleClose }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [displayedQuery, setDisplayedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isKeyboardNav, setIsKeyboardNav] = useState(false)
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)
  const { t } = usePluginTranslation()
  const { i18n } = useTranslation()
  const { config } = useConfig()
  const {
    routes: { admin, api },
  } = config
  const router = useRouter()
  const { visibleEntities } = useEntityVisibility()

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
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    triggerSearch(debouncedQuery || undefined)
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
      setSelectedIndex(mergedResults.length > 0 ? 0 : -1)
      setDisplayedQuery(debouncedQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      let path: `/${string}`
      if (result.type === 'document') {
        path = `/collections/${result.doc.relationTo}/${result.doc.value}`
      } else if (result.type === 'collection') {
        path = `/collections/${result.slug}`
      } else {
        path = `/globals/${result.slug}`
      }
      router.push(formatAdminURL({ adminRoute: admin, path }))
      handleClose()
    },
    [router, admin, handleClose],
  )

  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      const isArrowKey = e.key === 'ArrowDown' || e.key === 'ArrowUp'

      if (isArrowKey && results.length > 0) {
        e.preventDefault()
        setIsKeyboardNav(true)
        setSelectedIndex((prev) =>
          e.key === 'ArrowDown' ? Math.min(prev + 1, results.length - 1) : Math.max(prev - 1, 0),
        )
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
    if (!isKeyboardNav) {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Ignore "fake" mouse moves that some browsers fire on scroll
      // This ensures we only re-enable hover when the user *actually* moves the mouse
      if (e.movementX === 0 && e.movementY === 0) {
        return
      }
      setIsKeyboardNav(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isKeyboardNav])

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
      aria-label={t('closeSearchModal')}
      className="admin-search-plugin-modal__overlay"
      onClick={handleClose}
      onKeyDown={(e) => e.key === 'Enter' && handleClose()}
      role="button"
      tabIndex={0}
    >
      <div
        aria-label={t('searchModalContent')}
        className="admin-search-plugin-modal__content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
      >
        <div className="admin-search-plugin-modal__header">
          <div className="admin-search-plugin-modal__input-wrapper">
            <span className="admin-search-plugin-modal__search-icon">
              <SearchIcon />
            </span>
            <input
              aria-label={t('searchForDocuments')}
              className="admin-search-plugin-modal__input-field"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyboardNavigation}
              placeholder={t('searchPlaceholder')}
              ref={inputRef}
              type="text"
              value={query}
            />
            <span className="admin-search-plugin-modal__escape-hint">{t('escapeHint')}</span>
          </div>
        </div>

        <div className="admin-search-plugin-modal__results-container">
          {isLoading && results.length === 0 && !displayedQuery && (
            <ul className="admin-search-plugin-modal__results-list">
              {Array.from({ length: SEARCH_RESULTS_LIMIT }).map((_, index) => (
                <SearchResultItemSkeleton key={index} />
              ))}
            </ul>
          )}
          {isError && <Banner type="error">{t('errorSearching')}</Banner>}
          {!isError && results.length === 0 && displayedQuery && (
            <div className="admin-search-plugin-modal__no-results-message">
              <p>{t('noResultsFound').replace('{query}', displayedQuery)}</p>
              <p className="admin-search-plugin-modal__no-results-hint">{t('noResultsHint')}</p>
            </div>
          )}
          {!isError && results.length > 0 && (
            <ul
              className={`admin-search-plugin-modal__results-list ${isKeyboardNav ? 'is-keyboard-nav' : ''}`}
              ref={resultsRef}
            >
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

        <div className="admin-search-plugin-modal__footer">
          <div className="admin-search-plugin-modal__keyboard-shortcuts">
            {[
              { key: '↑↓', label: t('toNavigate') },
              { key: '↵', label: t('toOpen') },
              { key: t('escapeHint'), label: t('toClose') },
            ].map(({ key, label }) => (
              <div className="admin-search-plugin-modal__shortcut-item" key={key}>
                <span className="admin-search-plugin-modal__shortcut-key">{key}</span>
                <span className="admin-search-plugin-modal__shortcut-description">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
