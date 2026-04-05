import type { PayloadHandler, PayloadRequest } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

/**
 * POST /vercel-deployments
 * Triggers a new production deployment by redeploying the latest READY deployment.
 * Requires authentication.
 */
const defaultAccess: NonNullable<VercelDeploymentsPluginConfig['access']> = ({ req }) => !!req.user

export const triggerDeploymentEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  const pluginConfig = req.payload.config.custom?.vercelDeploymentsPluginConfig as
    | VercelDeploymentsPluginConfig
    | undefined

  if (!pluginConfig) {
    return Response.json({ error: 'Plugin config not found' }, { status: 500 })
  }

  const access = pluginConfig.access ?? defaultAccess
  if (!(await access({ req }))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

    // Find the latest READY production deployment to redeploy
    const deploymentsResponse = await vercelClient.getDeployments({
      limit: 1,
      projectId: pluginConfig.vercel.projectId,
      state: 'READY',
      target: 'production',
      teamId: pluginConfig.vercel.teamId,
    })

    const latestReadyDeployment = deploymentsResponse.deployments.at(0)
    if (!latestReadyDeployment) {
      return Response.json(
        { error: 'No READY production deployment found to redeploy' },
        { status: 404 },
      )
    }

    const deployment = await vercelClient.createDeployment({
      requestBody: {
        deploymentId: latestReadyDeployment.uid,
        name: pluginConfig.vercel.projectId,
        target: 'production',
      },
      teamId: pluginConfig.vercel.teamId,
    })

    return Response.json({ id: deployment.id })
  } catch (error) {
    console.error('Error triggering deployment:', error)
    return Response.json(
      {
        error: `Error triggering deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 },
    )
  }
}
