// Document search result (existing functionality)
export interface SearchResultDocument {
  doc: {
    relationTo: string
    value: string
  }
  id: string
  title: string
  type: 'document'
}

// Collection search result (new functionality)
export interface SearchResultCollection {
  id: string
  label: string
  slug: string
  type: 'collection'
}

// Global search result (new functionality)
export interface SearchResultGlobal {
  id: string
  label: string
  slug: string
  type: 'global'
}

// Union type for all search results
export type SearchResult = SearchResultCollection | SearchResultDocument | SearchResultGlobal
