'use client'

import { Pill, useTranslation } from '@payloadcms/ui'
import React from 'react'

import type { SearchResult } from '../../types/SearchResult.js'

interface SearchResultItemProps {
  index: number
  onMouseEnter: () => void
  onResultClick: (result: SearchResult) => void
  query: string
  result: SearchResult
  selectedIndex: number
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

const getCollectionDisplayName = (relationTo: string) => {
  return relationTo
    .split('-')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const getAriaLabel = (result: SearchResult, displayTitle: string): string => {
  if (result.type === 'document') {
    return `Open ${displayTitle} in ${getCollectionDisplayName(result.doc.relationTo)}`
  } else if (result.type === 'collection') {
    return `Open ${result.label} collection`
  } else {
    return `Open ${result.label} global`
  }
}

export const SearchResultItem: React.FC<SearchResultItemProps> = ({
  index,
  onMouseEnter,
  onResultClick,
  query,
  result,
  selectedIndex,
}) => {
  const { t } = useTranslation()

  const renderContent = () => {
    if (result.type === 'document') {
      const displayTitle =
        result.title && result.title.trim().length > 0 ? result.title : `[${t('general:untitled')}]`

      return (
        <>
          <span className="search-modal__result-title">{highlightSearchTerm(displayTitle, query)}</span>
          <Pill size="small">{getCollectionDisplayName(result.doc.relationTo)}</Pill>
        </>
      )
    } else if (result.type === 'collection') {
      return (
        <>
          <span className="search-modal__result-title">{highlightSearchTerm(result.label, query)}</span>
          <Pill size="small">Collection</Pill>
        </>
      )
    } else if (result.type === 'global') {
      return (
        <>
          <span className="search-modal__result-title">{highlightSearchTerm(result.label, query)}</span>
          <Pill size="small">Global</Pill>
        </>
      )
    }
  }

  const displayTitle =
    result.type === 'document' && result.title && result.title.trim().length > 0
      ? result.title
      : result.type === 'document'
        ? `[${t('general:untitled')}]`
        : result.label

  return (
    <li
      className={`search-modal__result-item-container ${selectedIndex === index ? 'selected' : ''}`}
      key={result.id}
      onMouseEnter={onMouseEnter}
    >
      <button
        aria-label={getAriaLabel(result, displayTitle)}
        className="search-modal__result-item-button"
        onClick={() => onResultClick(result)}
        onKeyDown={(e) => e.key === 'Enter' && onResultClick(result)}
        type="button"
      >
        <div className="search-modal__result-content">{renderContent()}</div>
      </button>
    </li>
  )
}
