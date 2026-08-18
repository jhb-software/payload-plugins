import type { PayloadRequest, ServerProps } from 'payload'
import type React from 'react'

import { headers as nextHeaders } from 'next/headers.js'

import { resolveBaseFilter } from './resolveBaseFilter.js'
import { SearchWrapperClient } from './SearchWrapperClient.js'

export type SearchWrapperProps = {
  style?: 'bar' | 'button'
} & Partial<ServerProps>

/**
 * Resolves the configured `baseFilter` on the server and hands the resulting constraint to
 * the search UI, so results stay inside the scope of the current request.
 */
export async function SearchWrapper({
  i18n,
  payload,
  style = 'button',
  user,
}: SearchWrapperProps): Promise<React.ReactElement> {
  const baseFilter = payload
    ? await resolveBaseFilter({
        headers: await nextHeaders(),
        // Admin components carry the client-facing subset of the translations; reusing it
        // spares a full translation init per render, at the cost of the server-only keys
        // that a base filter has no reason to reach for.
        i18n: i18n as PayloadRequest['i18n'],
        payload,
        user,
      })
    : undefined

  return <SearchWrapperClient baseFilter={baseFilter} style={style} />
}
