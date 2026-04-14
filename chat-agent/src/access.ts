import type { Payload, PayloadRequest } from 'payload'

export type PluginAccessFn = (req: PayloadRequest) => boolean | Promise<boolean>

export function getPluginAccess(payload: Payload | undefined): PluginAccessFn | undefined {
  return payload?.config?.custom?.chatAgent?.access as PluginAccessFn | undefined
}

/**
 * Shared access check for the chat agent plugin.
 *
 * Reads the plugin's `access` function and evaluates it against the current
 * request. When no access function is configured, falls back to
 * "any authenticated user".
 */
export async function isPluginAccessAllowed(
  req: Pick<PayloadRequest, 'payload' | 'user'>,
): Promise<boolean> {
  const access = getPluginAccess(req?.payload)
  if (access) {
    return Boolean(await access(req as PayloadRequest))
  }
  return !!req?.user
}
