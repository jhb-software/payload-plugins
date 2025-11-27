import React from 'react'

interface SearchModalSkeletonProps {
  count?: number
}

export const SearchModalSkeleton: React.FC<SearchModalSkeletonProps> = ({ count = 5 }) => {
  return (
    <ul className="admin-search-plugin-modal__results-list">
      {Array.from({ length: count }).map((_, index) => (
        <li className="admin-search-plugin-modal__result-item-container" key={index}>
          <div className="admin-search-plugin-modal__result-item-button admin-search-plugin-modal__skeleton-item">
            <div className="admin-search-plugin-modal__result-content">
              <div className="admin-search-plugin-modal__skeleton-shimmer admin-search-plugin-modal__skeleton-title" />
              <div className="admin-search-plugin-modal__skeleton-shimmer admin-search-plugin-modal__skeleton-pill" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
} 