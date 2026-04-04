import type { PayloadHandler, PayloadRequest } from 'payload'

import type { VercelDashboardPluginConfig } from '../types.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

export type DeploymentsInfo = {
  lastReadyDeployment:
    | {
        inspectorUrl: null | string
        readyAt: string
        status: 'READY'
        uid: string
      }
    | undefined

  latestDeployment:
    | {
        createdAt: string
        inspectorUrl: null | string
        status: string
        uid: string
      }
    | undefined
}

/**
 * GET /vercel-dashboard/deployments-info
 * Returns information about the latest production deployments. Requires authentication.
 */
export const getDeploymentsInfoEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pluginConfig = req.payload.config.custom?.vercelDashboardPluginConfig as
    | VercelDashboardPluginConfig
    | undefined

  if (!pluginConfig) {
    return Response.json({ error: 'Plugin config not found' }, { status: 500 })
  }

  try {
    const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

    const deploymentsResponse = await vercelClient.getDeployments({
      limit: 10,
      projectId: pluginConfig.vercel.projectId,
      target: 'production',
      teamId: pluginConfig.vercel.teamId,
    })

    const lastReadyDeployment = deploymentsResponse.deployments.find(
      (deployment) => deployment.state === 'READY',
    )
    const latestDeployment = deploymentsResponse.deployments.at(0)

    const result: DeploymentsInfo = {
      lastReadyDeployment: lastReadyDeployment
        ? {
            inspectorUrl: lastReadyDeployment.inspectorUrl,
            readyAt: new Date(
              typeof lastReadyDeployment.ready === 'number'
                ? lastReadyDeployment.ready
                : lastReadyDeployment.created,
            ).toISOString(),
            status: 'READY',
            uid: lastReadyDeployment.uid,
          }
        : undefined,
      latestDeployment:
        latestDeployment && latestDeployment.state
          ? {
              createdAt: new Date(latestDeployment.created).toISOString(),
              inspectorUrl: latestDeployment.inspectorUrl,
              status: latestDeployment.state,
              uid: latestDeployment.uid,
            }
          : undefined,
    }

    return Response.json(result)
  } catch (error) {
    console.error('Error fetching deployments info:', error)
    return Response.json(
      { error: `Error fetching deployments info: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 },
    )
  }
}
