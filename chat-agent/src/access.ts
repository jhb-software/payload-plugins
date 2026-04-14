/* eslint-disable @typescript-eslint/no-explicit-any */

export type PluginAccessFn = (req: any) => boolean | Promise<boolean>

export function getPluginAccess(payload: any): PluginAccessFn | undefined {
  return payload?.config?.custom?.chatAgent?.access as PluginAccessFn | undefined
}

/**
 * Shared access check for the chat agent plugin.
 *
 * Reads the plugin's `access` function and evaluates it against the current
 * request. When no access function is configured, falls back to
 * "any authenticated user".
 */
export async function isPluginAccessAllowed(req: any): Promise<boolean> {
  const access = getPluginAccess(req?.payload)
  if (access) {
    return Boolean(await access(req))
  }
  return !!req?.user
}
