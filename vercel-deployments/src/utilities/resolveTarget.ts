import type { PayloadRequest } from 'payload'

import type { DeploymentTarget, VercelDeploymentsPluginConfig } from '../types.js'

/**
 * Resolves the deployment target of a request: the Vercel project to read from or deploy
 * to, and the website URL shown in the widget.
 *
 * A `deploymentTarget` function is called exactly once per request, so a multi-tenant CMS
 * pays a single lookup for both values.
 */
export const resolveTarget = async ({
  pluginConfig,
  req,
}: {
  pluginConfig: VercelDeploymentsPluginConfig
  req: PayloadRequest
}): Promise<DeploymentTarget> =>
  typeof pluginConfig.deploymentTarget === 'function'
    ? await pluginConfig.deploymentTarget({ req })
    : pluginConfig.deploymentTarget
