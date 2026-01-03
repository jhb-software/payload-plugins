'use server'

import { unstable_cache } from 'next/cache.js'

import type { VercelDashboardPluginConfig } from '../types.js'
import type { VercelDeployment } from '../utilities/vercelApiClient.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

export type DeploymentsInfo = {
  lastReadyDeployment:
    | {
        inspectorUrl: null | string
        readyAt: Date
        status: 'READY'
        uid: string
      }
    | undefined

  latestDeployment:
    | {
        createdAt: Date
        inspectorUrl: null | string
        status: VercelDeployment['status']
        uid: string
      }
    | undefined
}

/**
 * Fetches the latest deployment information from Vercel.
 * @returns {Promise<DeploymentsInfo>} An object containing the latest deployment information.
 */
export async function getFrontendDeploymentsInfo(
  pluginConfig: VercelDashboardPluginConfig,
): Promise<DeploymentsInfo> {
  const getCached = unstable_cache(
    async () => {
      const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

      const deploymentsResponse = await vercelClient.getDeployments({
        limit: 10,
        projectId: pluginConfig.vercel.projectId,
        target: 'production', // exclude preview deployments
        teamId: pluginConfig.vercel.teamId,
      })

      const lastReadyDeployment = deploymentsResponse.deployments.find(
        (deployment) => deployment.state === 'READY',
      )
      const latestDeployment = deploymentsResponse.deployments.at(0)

      const deploymentsInfo: DeploymentsInfo = {
        lastReadyDeployment: lastReadyDeployment
          ? {
              inspectorUrl: lastReadyDeployment.inspectorUrl,
              readyAt: new Date(
                typeof lastReadyDeployment.ready === 'number'
                  ? lastReadyDeployment.ready
                  : lastReadyDeployment.created,
              ),
              status: 'READY',
              uid: lastReadyDeployment.uid,
            }
          : undefined,
        latestDeployment:
          latestDeployment && latestDeployment.state
            ? {
                createdAt: new Date(latestDeployment.created),
                inspectorUrl: latestDeployment.inspectorUrl,
                status: latestDeployment.state,
                uid: latestDeployment.uid,
              }
            : undefined,
      }

      return deploymentsInfo
    },
    ['vercel-deployments', pluginConfig.vercel.projectId],
    {
      revalidate: 60,
      tags: ['vercel-deployments'],
    },
  )

  return getCached()
}
