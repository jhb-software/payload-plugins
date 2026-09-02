import type { Payload, PayloadRequest } from 'payload'

import type { AdminSearchPluginConfig } from '../../types/AdminSearchPluginConfig.js'
import type { BaseFilterState } from '../../types/BaseFilterState.js'

/**
 * Evaluates the configured `baseFilter` against the request the admin panel is rendering.
 *
 * The request is not built here: Payload already builds one for this render (see `initReq`
 * in `@payloadcms/next`, which resolves the locale on top of it) and passes it to admin
 * components as a server prop. Rebuilding it would drop that resolved locale.
 *
 * A configured filter that cannot be evaluated resolves to `unavailable`, which stops the
 * search from running at all. Widening to every document instead would leak exactly what the
 * filter exists to hide — across tenants, in the case it was built for.
 */
export const resolveBaseFilter = async ({
  payload,
  req,
}: {
  payload: Payload
  req?: PayloadRequest
}): Promise<BaseFilterState> => {
  const baseFilter = (
    payload.config.custom?.adminSearchPluginConfig as AdminSearchPluginConfig | undefined
  )?.baseFilter

  if (!baseFilter) {
    return { status: 'resolved' }
  }

  if (!req) {
    // `req` is not part of Payload's exported `ServerProps` type, only of what it passes at
    // runtime. If a future version stops passing it, no filter can be evaluated at all, so
    // name the cause — a search that returns nothing is otherwise hard to trace back to here.
    payload.logger.error(
      'admin-search: no request was passed to the search component, so `baseFilter` could not be evaluated. The search returns no results.',
    )

    return { status: 'unavailable' }
  }

  try {
    return { filter: await baseFilter({ req }), status: 'resolved' }
  } catch (error) {
    // The filter runs while the admin panel renders, so letting it throw would replace the
    // whole page with an error, not just the search. Failing the search alone is the lesser
    // failure — but a silent one, hence the log.
    payload.logger.error(
      { err: error },
      'admin-search: baseFilter threw, so the search returns no results.',
    )

    return { status: 'unavailable' }
  }
}
