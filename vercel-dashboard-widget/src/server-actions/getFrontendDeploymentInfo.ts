'use server'

import type { VercelDashboardPluginConfig } from '../types.js'
import type { VercelDeployment } from '../utilities/vercelApiClient.js';

import { VercelApiClient } from '../utilities/vercelApiClient.js'

export type DeploymentInfo = {
  id: string
  status: VercelDeployment['status']
}

/**
 * Fetches information about the deployment with the given id.
 * @param {string} id - The id of the deployment to fetch.
 * @returns {Promise<DeploymentInfo>} An object containing the deployment information.
 */
export const getFrontendDeploymentInfo = async (
  id: string,
  pluginConfig: VercelDashboardPluginConfig,
): Promise<DeploymentInfo> => {
  const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

  const deployment = await vercelClient.getDeployment({
    idOrUrl: id,
    teamId: pluginConfig.vercel.teamId,
  })

  // to improve latency and improve security, only sent the data that is needed
  return {
    id: deployment.id,
    status: deployment.status,
  }
}
