import type { PayloadHandler, PayloadRequest } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

/**
 * GET /vercel-deployments/status?id=<deploymentId>
 * Returns the status of a specific deployment. Requires authentication.
 */
export const getDeploymentInfoEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pluginConfig = req.payload.config.custom?.vercelDeploymentsPluginConfig as
    | VercelDeploymentsPluginConfig
    | undefined

  if (!pluginConfig) {
    return Response.json({ error: 'Plugin config not found' }, { status: 500 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'Missing required query parameter: id' }, { status: 400 })
  }

  try {
    const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

    const deployment = await vercelClient.getDeployment({
      idOrUrl: id,
      teamId: pluginConfig.vercel.teamId,
    })

    return Response.json({
      id: deployment.id,
      status: deployment.status,
    })
  } catch (error) {
    console.error('Error fetching deployment info:', error)
    return Response.json(
      { error: `Error fetching deployment info: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 },
    )
  }
}
