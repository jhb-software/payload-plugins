import type { PayloadRequest, ServerProps } from 'payload'
import type React from 'react'

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
  const baseFilter = payload ? await resolveBaseFilter({ payload, req }) : undefined

  return <SearchWrapperClient baseFilter={baseFilter} style={style} />
}
