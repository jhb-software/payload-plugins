import type { Payload, PayloadRequest } from 'payload'

import { getPluginOptions } from './plugin-custom-config.js'

export type PluginAccessFn = (req: PayloadRequest) => boolean | Promise<boolean>

export function getPluginAccess(payload: Payload | undefined): PluginAccessFn | undefined {
  return getPluginOptions(payload)?.access
}

/**
 * Shared access check for the chat agent plugin.
 *
 * Reads the plugin's `access` function and evaluates it against the current
 * request. When no access function is configured, only users of the admin
 * user collection (`admin.user`) are allowed: other auth collections, such as
 * site customers, must be admitted explicitly.
 */
export async function isPluginAccessAllowed(
  req: Pick<PayloadRequest, 'payload' | 'user'>,
): Promise<boolean> {
  const access = getPluginAccess(req?.payload)
  if (access) {
    return Boolean(await access(req as PayloadRequest))
  }
  return Boolean(req?.user) && req.user?.collection === req.payload.config.admin.user
}
