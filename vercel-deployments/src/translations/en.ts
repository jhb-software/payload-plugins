import type { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Active Deployment',
    deploymentInfoDeploymentCompletedSuccessfully: 'New deployment completed successfully',
    deploymentInfoDeploymentTriggeredFailed: 'Failed to redeploy the latest production deployment',
    deploymentInfoDeploymentTriggeredSuccessfully:
      'Latest production deployment redeployed successfully',
    deploymentInfoError: 'Error fetching deployment info',
    deploymentInfoInspectDeployment: 'Inspect Deployment',
    deploymentInfoLatestDeployment: 'Latest Deployment',
    deploymentInfoTitle: 'Vercel Deployments',
    deploymentInfoTriggerRedeploy: 'Redeploy Latest Production',
    deploymentInfoWebsite: 'Website',

    // Vercel Deployment Status
    vercelDeploymentStatusBuilding: 'Building',
    vercelDeploymentStatusCanceled: 'Canceled',
    vercelDeploymentStatusDeleted: 'Deleted',
    vercelDeploymentStatusError: 'Error',
    vercelDeploymentStatusFailed: 'Failed',
    vercelDeploymentStatusInitializing: 'Initializing',
    vercelDeploymentStatusQueued: 'Queued',
    vercelDeploymentStatusReady: 'Ready',
    vercelDeploymentStatusUnknown: 'Unknown Status',
  },
}
