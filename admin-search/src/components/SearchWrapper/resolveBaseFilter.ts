import type { Payload, PayloadRequest, TypedUser, Where } from 'payload'

import type { AdminSearchPluginConfig } from '../../types/AdminSearchPluginConfig.js'

/**
 * Evaluates the configured `baseFilter` against the current admin request.
 *
 * Admin components receive `payload` and `user`, but no request — so one is built from the
 * incoming headers, which is what carries the scope a filter reads (e.g. the `payload-tenant`
 * cookie set by the multi-tenant plugin).
 */
export const resolveBaseFilter = async ({
  headers,
  i18n,
  payload,
  user,
}: {
  headers: Headers
  i18n?: PayloadRequest['i18n']
  payload: Payload
  user?: TypedUser
}): Promise<undefined | Where> => {
  const baseFilter = (
    payload.config.custom?.adminSearchPluginConfig as AdminSearchPluginConfig | undefined
  )?.baseFilter

  if (!baseFilter) {
    return undefined
  }

  const { createLocalReq } = await import('payload')
  // Reuse the admin panel's i18n rather than letting createLocalReq initialize its own.
  const req = await createLocalReq({ req: { headers, i18n }, user }, payload)

  return baseFilter({ req })
}
