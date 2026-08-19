import type { Payload, PayloadRequest, Where } from 'payload'

import type { AdminSearchPluginConfig } from '../../types/AdminSearchPluginConfig.js'

/**
 * Evaluates the configured `baseFilter` against the request the admin panel is rendering.
 *
 * The request is not built here: Payload already builds one for this render (see `initReq`
 * in `@payloadcms/next`, which resolves the locale on top of it) and passes it to admin
 * components as a server prop. Rebuilding it would drop that resolved locale.
 */
export const resolveBaseFilter = async ({
  payload,
  req,
}: {
  payload: Payload
  req?: PayloadRequest
}): Promise<undefined | Where> => {
  const baseFilter = (
    payload.config.custom?.adminSearchPluginConfig as AdminSearchPluginConfig | undefined
  )?.baseFilter

  if (!baseFilter) {
    return undefined
  }

  if (!req) {
    // `req` is not part of Payload's exported `ServerProps` type, only of what it passes at
    // runtime. If a future version stops passing it, the search silently widens to every
    // document — so say so loudly rather than letting it pass unnoticed.
    payload.logger.error(
      'admin-search: no request was passed to the search component, so `baseFilter` could not be evaluated. The search is unscoped.',
    )

    return undefined
  }

  try {
    return await baseFilter({ req })
  } catch (error) {
    // The filter runs while the admin panel renders, so letting it throw would replace the
    // whole page with an error, not just the search. It narrows a query rather than granting
    // access, so falling back to an unscoped search is the lesser failure — but a silent one,
    // hence the log.
    payload.logger.error(
      { err: error },
      'admin-search: baseFilter threw, falling back to an unscoped search.',
    )

    return undefined
  }
}
