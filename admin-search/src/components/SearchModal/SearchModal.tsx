'use client'

import { Banner, SearchIcon, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import { formatAdminURL } from 'payload/shared'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SearchResult } from '../../types/SearchResult.js'

import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchResultItem } from '../SearchResultItem/SearchResultItem.js'
import { SearchResultItemSkeleton } from '../SearchResultItem/SearchResultItemSkeleton.js'
import './SearchModal.css'
import { useSearch } from './useSearch.js'

interface SearchModalProps {
  handleClose: () => void
}

export const SearchModal: React.FC<SearchModalProps> = ({ handleClose }) => {
  const { displayedQuery, isError, isLoading, query, results, resultsLimit, setQuery } = useSearch()
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isKeyboardNav, setIsKeyboardNav] = useState(false)

  const { t } = usePluginTranslation()
  const { config } = useConfig()
  const router = useRouter()

  const resultsRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-select first result when results change
  useEffect(() => {
    setSelectedIndex(results.length > 0 ? 0 : -1)
  }, [results])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex !== -1 && resultsRef.current) {
      const selectedItem = resultsRef.current.children[selectedIndex]
      if (selectedItem instanceof HTMLLIElement) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Re-enable hover after mouse movement
  useEffect(() => {
    if (!isKeyboardNav) {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (e.movementX === 0 && e.movementY === 0) {
        return
      }
      setIsKeyboardNav(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isKeyboardNav])

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
      router.push(formatAdminURL({ adminRoute: config.routes.admin, path }))
      handleClose()
    },
    [router, config.routes.admin, handleClose],
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

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== 'Escape') {
        return
      }
      handleKeyboardNavigation(e)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyboardNavigation])

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
              {Array.from({ length: resultsLimit }).map((_, index) => (
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
