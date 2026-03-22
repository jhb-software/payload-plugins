'use server'

import { revalidateTag } from 'next/cache.js'

import type { VercelDashboardPluginConfig } from '../types.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

/** Triggers a new production deployment of the frontend. */
export async function triggerFrontendDeployment(
  pluginConfig: VercelDashboardPluginConfig,
): Promise<string> {
  const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)
  const latestReadyDeployment = await getLatestReadyProductionDeployment(vercelClient, pluginConfig)

  const deployment = await vercelClient.createDeployment({
    requestBody: {
      name: pluginConfig.vercel.projectId,
      deploymentId: latestReadyDeployment.uid,
      target: 'production',
    },
    teamId: pluginConfig.vercel.teamId,
  })

  revalidateTag('vercel-deployments')

  return deployment.id
}

/** Finds the latest READY production deployment that can be redeployed. */
async function getLatestReadyProductionDeployment(
  vercelClient: VercelApiClient,
  pluginConfig: VercelDashboardPluginConfig,
): Promise<{
  uid: string
}> {
  const deploymentsResponse = await vercelClient.getDeployments({
    limit: 1,
    projectId: pluginConfig.vercel.projectId,
    state: 'READY',
    target: 'production',
    teamId: pluginConfig.vercel.teamId,
  })

  const latestReadyDeployment = deploymentsResponse.deployments.at(0)
  if (!latestReadyDeployment) {
    throw new Error('No READY production deployment found to redeploy')
  }

  return {
    uid: latestReadyDeployment.uid,
  }
}
