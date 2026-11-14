import type { PayloadRequest } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'

const defaultAccess: NonNullable<VercelDeploymentsPluginConfig['access']> = ({ req }) => !!req.user

/**
 * Whether the request may read or trigger deployments, per the plugin's `access` option.
 * Gates both the endpoints and the dashboard widget, which reads from Vercel directly.
 */
export const hasAccess = async ({
  pluginConfig,
  req,
}: {
  pluginConfig: VercelDeploymentsPluginConfig
  req: PayloadRequest
}): Promise<boolean> => !!(await (pluginConfig.access ?? defaultAccess)({ req }))
