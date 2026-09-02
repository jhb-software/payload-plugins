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
 * Starts resolving the configured `baseFilter` for this request and hands the pending result
 * to the search UI, so results stay inside the scope of the current request.
 *
 * Deliberately not `async`: this component is rendered from the admin template's actions on
 * every page, with no Suspense boundary around it, so awaiting a filter that reads the
 * database would put that read on the critical path of every admin page render. The search
 * button needs no filter to render — only a search does — so the promise travels to the
 * client and is awaited inside the modal instead.
 */
export function SearchWrapper({
  payload,
  req,
  style = 'button',
}: SearchWrapperProps): React.ReactElement {
  // Without `payload` the plugin cannot read its own options back off the config, so whether
  // a filter is configured at all is unknowable. Treating that as `unavailable` would break
  // the search for everyone who never configured one, so leave it unscoped instead.
  const baseFilterPromise: Promise<BaseFilterState> = payload
    ? resolveBaseFilter({ payload, req })
    : Promise.resolve({ status: 'resolved' })

  return <SearchWrapperClient baseFilterPromise={baseFilterPromise} style={style} />
}
