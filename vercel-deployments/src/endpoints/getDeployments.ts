import type { PayloadHandler, PayloadRequest } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'

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
 * GET /vercel-deployments
 *
 * Without query params: returns the active (latest READY) and latest production deployment.
 * With ?id=<deploymentId>: returns the status of a specific deployment.
 *
 * Requires authentication.
 */
const defaultAccess: NonNullable<VercelDeploymentsPluginConfig['access']> = ({ req }) => !!req.user

export const getDeploymentsEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  const pluginConfig = req.payload.config.custom?.vercelDeploymentsPluginConfig as
    | undefined
    | VercelDeploymentsPluginConfig

  if (!pluginConfig) {
    return Response.json({ error: 'Plugin config not found' }, { status: 500 })
  }

  const access = pluginConfig.access ?? defaultAccess
  if (!(await access({ req }))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url ?? '', 'http://localhost')
  const id = url.searchParams.get('id')

  try {
    const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

    // Single deployment lookup
    if (id) {
      const deployment = await vercelClient.getDeployment({
        idOrUrl: id,
        teamId: pluginConfig.vercel.teamId,
      })

      return Response.json({
        id: deployment.id,
        status: deployment.status,
      })
    }

    // List latest production deployments
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
    console.error('Error fetching deployment info:', error)
    return Response.json(
      {
        error: `Error fetching deployment info: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 },
    )
  }
}
