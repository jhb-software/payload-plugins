'use client'
import type { Where } from 'payload'
import type React from 'react'

import { SearchBar } from '../SearchBar/SearchBar.js'
import { SearchButton } from '../SearchButton/SearchButton.js'

export interface SearchWrapperClientProps {
  baseFilter?: Where
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
