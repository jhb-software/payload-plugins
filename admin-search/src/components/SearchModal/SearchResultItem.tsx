import { Pill, useTranslation } from '@payloadcms/ui'
import React from 'react'

import type { SearchResult } from '../../types/SearchResult.js'

import { usePluginTranslation } from '../../utils/usePluginTranslations.js'

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
        <mark className="admin-search-plugin-modal__highlighted-text" key={index}>
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

const getAriaLabel = (
  result: SearchResult,
  displayTitle: string,
  t: (key: string) => string,
): string => {
  if (result.type === 'document') {
    return t('openDocumentIn')
      .replace('{title}', displayTitle)
      .replace('{collection}', getCollectionDisplayName(result.doc.relationTo))
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
  const { t: payloadT } = useTranslation()
  const { t } = usePluginTranslation()

  const title =
    result.type === 'document' && result.title && result.title.trim().length > 0
      ? result.title
      : result.type === 'document'
        ? `[${payloadT('general:untitled')}]`
        : result.label

  return (
    <li
      className={`admin-search-plugin-modal__result-item-container ${selectedIndex === index ? 'selected' : ''}`}
      key={result.id}
      onMouseEnter={onMouseEnter}
    >
      <button
        aria-label={getAriaLabel(result, title, t)}
        className="admin-search-plugin-modal__result-item-button"
        onClick={() => onResultClick(result)}
        onKeyDown={(e) => e.key === 'Enter' && onResultClick(result)}
        type="button"
      >
        <div className="admin-search-plugin-modal__result-content">
          <span className="admin-search-plugin-modal__result-title">
            {highlightSearchTerm(title, query)}
          </span>
          <Pill size="small">
            {result.type === 'document'
              ? getCollectionDisplayName(result.doc.relationTo)
              : result.type === 'collection'
                ? t('pillCollection')
                : t('pillGlobal')}
          </Pill>
        </div>
      </button>
    </li>
  )
}
