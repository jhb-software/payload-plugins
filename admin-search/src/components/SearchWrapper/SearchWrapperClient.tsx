'use client'
import type React from 'react'

import type { BaseFilterState } from '../../types/BaseFilterState.js'

import { SearchBar } from '../SearchBar/SearchBar.js'
import { SearchButton } from '../SearchButton/SearchButton.js'

export interface SearchWrapperClientProps {
  baseFilter: BaseFilterState
  style?: 'bar' | 'button'
}

export function SearchWrapperClient({
  baseFilter,
  style = 'button',
}: SearchWrapperClientProps): React.ReactElement {
  if (style === 'bar') {
    return <SearchBar baseFilter={baseFilter} />
  }
  return <SearchButton baseFilter={baseFilter} />
}
