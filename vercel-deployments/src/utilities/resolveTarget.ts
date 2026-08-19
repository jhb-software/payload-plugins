import type { PayloadRequest } from 'payload'

import type { Resolvable, VercelDeploymentsPluginConfig } from '../types.js'

export type ResolvedTarget = {
  projectId: string | undefined
  websiteUrl: string | undefined
}

/**
 * Resolves the deployment target of a request: the Vercel project to read from or deploy
 * to, and the website URL shown in the widget. Both may be configured as a function, which
 * a multi-tenant CMS uses to return the values of the currently selected tenant.
 */
export const resolveTarget = async ({
  pluginConfig,
  req,
}: {
  pluginConfig: VercelDeploymentsPluginConfig
  req: PayloadRequest
}): Promise<ResolvedTarget> => {
  const resolve = async <T>(value: Resolvable<T>): Promise<T> =>
    typeof value === 'function'
      ? await (value as (args: { req: PayloadRequest }) => T)({ req })
      : value

  return {
    projectId: await resolve(pluginConfig.vercel.projectId),
    websiteUrl: await resolve(pluginConfig.widget?.websiteUrl),
  }
}
