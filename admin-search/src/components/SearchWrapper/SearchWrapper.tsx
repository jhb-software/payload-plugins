'use client'
import type React from 'react'

import { SearchBar } from '../SearchBar/SearchBar.js'
import { SearchButton } from '../SearchButton/SearchButton.js'

interface SearchWrapperProps {
  style?: 'bar' | 'button'
}

export function SearchWrapper({ style = 'button' }: SearchWrapperProps): React.ReactElement {
  if (style === 'bar') {
    return <SearchBar />
  }
  return <SearchButton />
}
