'use client'
import type React from 'react'

import type { BaseFilterState } from '../../types/BaseFilterState.js'

import { SearchBar } from '../SearchBar/SearchBar.js'
import { SearchButton } from '../SearchButton/SearchButton.js'

export interface SearchWrapperClientProps {
  /** Resolved on the server; awaited in the modal, which is the first thing that needs it. */
  baseFilterPromise: Promise<BaseFilterState>
  style?: 'bar' | 'button'
}

export function SearchWrapperClient({
  baseFilterPromise,
  style = 'button',
}: SearchWrapperClientProps): React.ReactElement {
  if (style === 'bar') {
    return <SearchBar baseFilterPromise={baseFilterPromise} />
  }
  return <SearchButton baseFilterPromise={baseFilterPromise} />
}
