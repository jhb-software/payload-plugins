import React from 'react'

import './SearchResultItem.css'

export const SearchResultItemSkeleton: React.FC = () => {
  return (
    <li className="search-result-item search-result-item--skeleton">
      <div className="search-result-item__button">
        <div className="search-result-item__content">
          <div className="search-result-item__skeleton-shimmer search-result-item__skeleton-title" />
          <div className="search-result-item__skeleton-shimmer search-result-item__skeleton-pill" />
        </div>
      </div>
    </li>
  )
}
