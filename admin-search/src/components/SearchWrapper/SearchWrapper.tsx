import type { PayloadRequest, ServerProps } from 'payload'
import type React from 'react'

import type { BaseFilterState } from '../../types/BaseFilterState.js'

import { resolveBaseFilter } from './resolveBaseFilter.js'
import { SearchWrapperClient } from './SearchWrapperClient.js'

export type SearchWrapperProps = {
  /**
   * The request Payload is rendering the admin panel for. Payload passes this to admin
   * components at runtime but does not list it on `ServerProps`, so it is declared here.
   * See `serverProps` in `@payloadcms/next`'s default template.
   */
  req?: PayloadRequest
  style?: 'bar' | 'button'
} & Partial<ServerProps>

/**
 * Resolves the configured `baseFilter` on the server and hands the resulting constraint to
 * the search UI, so results stay inside the scope of the current request.
 */
export async function SearchWrapper({
  payload,
  req,
  style = 'button',
}: SearchWrapperProps): Promise<React.ReactElement> {
  // Without `payload` the plugin cannot read its own options back off the config, so whether
  // a filter is configured at all is unknowable. Treating that as `unavailable` would break
  // the search for everyone who never configured one, so leave it unscoped instead.
  const baseFilter: BaseFilterState = payload
    ? await resolveBaseFilter({ payload, req })
    : { status: 'resolved' }

  return <SearchWrapperClient baseFilter={baseFilter} style={style} />
}
