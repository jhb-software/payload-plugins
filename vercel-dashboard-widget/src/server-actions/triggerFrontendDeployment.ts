'use server'

import { revalidateTag } from 'next/cache.js'

import type { VercelDashboardPluginConfig } from '../types.js'

import { VercelApiClient } from '../utilities/vercelApiClient.js'

/** Triggers a new production deployment of the frontend. */
export async function triggerFrontendDeployment(
  pluginConfig: VercelDashboardPluginConfig,
): Promise<string> {
  const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)
  const projectDetails = await getProjectDetails(vercelClient, pluginConfig)

  const deployment = await vercelClient.createDeployment({
    requestBody: {
      name: projectDetails.name,
      gitSource: projectDetails.gitSource,
      meta: {
        // Override to show the deployment was triggered by the CMS in the Vercel dashboard
        githubCommitAuthorLogin: 'cms-dashboard',
      },
      project: pluginConfig.vercel.projectId,
      projectSettings: {
        // IMPORTANT: Override the ignore build step so that a deployment is always triggered, even though there were no git changes
        commandForIgnoringBuildStep: 'exit 1',
      },
      target: 'production',
    },
    teamId: pluginConfig.vercel.teamId,
  })

  revalidateTag('vercel-deployments')

  return deployment.id
}

/** Fetches details about the project which are needed to trigger a deployment from the Vercel API. */
async function getProjectDetails(
  vercelClient: VercelApiClient,
  pluginConfig: VercelDashboardPluginConfig,
): Promise<{
  gitSource: {
    org: string
    ref: string
    repo: string
    type: 'github'
  }
  name: string
}> {
  const project = await vercelClient.getProject({
    projectId: pluginConfig.vercel.projectId,
    teamId: pluginConfig.vercel.teamId,
  })

  if (!project) {
    throw new Error('Project not found')
  }

  if (!project.link || project.link.type !== 'github') {
    throw new Error('Project link not found')
  }

  if (!project.link?.productionBranch || !project.link?.repo || !project.link?.org) {
    throw new Error('Project link is missing required fields')
  }

  return {
    name: project.name,
    gitSource: {
      type: 'github',
      org: project.link.org,
      ref: project.link.productionBranch,
      repo: project.link.repo,
    },
  }
}
