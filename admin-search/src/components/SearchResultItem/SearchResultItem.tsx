import { getTranslation } from '@payloadcms/translations'
import { Pill, useConfig, useTranslation } from '@payloadcms/ui'
import React from 'react'

import type { SearchResult } from '../../types/SearchResult.js'

import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import './SearchResultItem.css'

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
        <mark className="search-result-item__highlighted-text" key={index}>
          {part}
        </mark>
      )
    }
    return part
  })
}

const getAriaLabel = (
  result: SearchResult,
  displayTitle: string,
  collectionLabel: string,
  t: (key: string) => string,
): string => {
  if (result.type === 'document') {
    return t('openDocumentIn')
      .replace('{title}', displayTitle)
      .replace('{collection}', collectionLabel)
  } else if (result.type === 'collection') {
    return t('openCollectionLabel').replace('{label}', result.label)
  } else {
    return t('openGlobalLabel').replace('{label}', result.label)
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
  const { i18n, t: payloadT } = useTranslation()
  const { t } = usePluginTranslation()
  const { config } = useConfig()

  const getCollectionLabel = (slug: string): string => {
    const collection = config.collections.find((c) => c.slug === slug)

    if (collection?.labels?.singular) {
      return getTranslation(collection.labels.singular, i18n)
    }

    return slug
  }

  const collectionLabel =
    result.type === 'document' ? getCollectionLabel(result.doc.relationTo) : ''

  const title =
    result.type === 'document' && result.title && result.title.trim().length > 0
      ? result.title
      : result.type === 'document'
        ? `[${payloadT('general:untitled')}]`
        : result.label

  return (
    <li
      className={`search-result-item ${selectedIndex === index ? 'search-result-item--selected' : ''}`}
      key={result.id}
      onMouseEnter={onMouseEnter}
    >
      <button
        aria-label={getAriaLabel(result, title, collectionLabel, t)}
        className="search-result-item__button"
        onClick={() => onResultClick(result)}
        onKeyDown={(e) => e.key === 'Enter' && onResultClick(result)}
        type="button"
      >
        <div className="search-result-item__content">
          <span className="search-result-item__title">{highlightSearchTerm(title, query)}</span>
          <Pill size="small">
            {result.type === 'document'
              ? collectionLabel
              : result.type === 'collection'
                ? t('pillCollection')
                : t('pillGlobal')}
          </Pill>
        </div>
      </button>
    </li>
  )
}
