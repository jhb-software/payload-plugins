'use client'

import {
  Banner,
  Pill,
  SearchIcon,
  useConfig,
  useDebounce,
  usePayloadAPI,
  useTranslation,
} from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SearchResult } from '../../types/SearchResult.js'

import { SearchModalSkeleton } from './SearchModalSkeleton.js'
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
  const [isKeyboardNav, setIsKeyboardNav] = useState(false)
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)
  const { t } = useTranslation()
  const {
    config: {
      routes: { admin, api },
    },
  } = useConfig()
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

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Initial search to show default results
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
      setResults(data.docs as SearchResult[])
      setSelectedIndex(-1)
    }
  }, [data])

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      const { relationTo, value } = result.doc
      const collectionSlug = relationTo
      const documentId = value

      if (collectionSlug && documentId) {
        window.location.href = `${admin}/collections/${collectionSlug}/${documentId}`
      }
    },
    [admin],
  )

  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIsKeyboardNav(true)
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIsKeyboardNav(true)
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

  const getCollectionDisplayName = (result: SearchResult) => {
    if (result.doc && 'relationTo' in result.doc) {
      return result.doc.relationTo
        .split('-')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }
    return 'Unknown'
  }

  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim() || !text) {
      return text
    }

    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi')

    if (!regex.test(text)) {
      return text
    }

    regex.lastIndex = 0
    const parts = text.split(regex)

    return parts.map((part, index) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <mark className="search-modal__highlighted-text" key={index}>
            {part}
          </mark>
        )
      }
      return part
    })
  }

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
              <p className="search-modal__no-results-hint">Try different keywords or check your spelling</p>
            </div>
          )}
          {!isLoading && !isError && results.length > 0 && (
            <ul
              className={`search-modal__results-list ${isKeyboardNav ? 'is-keyboard-nav' : ''}`}
              ref={resultsRef}
            >
              {results.map((result, index) => {
                const displayTitle =
                  result.title && result.title.trim().length > 0
                    ? result.title
                    : `[${t('general:untitled')}]`
                return (
                  <li
                    className={`search-modal__result-item-container ${
                      selectedIndex === index ? 'selected' : ''
                    }`}
                    key={result.id}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <button
                      aria-label={`Open ${displayTitle} in ${getCollectionDisplayName(result)}`}
                      className="search-modal__result-item-button"
                      onClick={() => handleResultClick(result)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResultClick(result)}
                      type="button"
                    >
                      <div className="search-modal__result-content">
                        <span className="search-modal__result-title">
                          {highlightSearchTerm(displayTitle, query)}
                        </span>
                        <Pill size="small">{getCollectionDisplayName(result)}</Pill>
                      </div>
                    </button>
                  </li>
                )
              })}
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
