import type { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Active Deployment',
    deploymentInfoDeploymentCompletedSuccessfully: 'New deployment completed successfully',
    deploymentInfoDeploymentTriggeredFailed: 'Could not start deployment',
    deploymentInfoDeploymentTriggeredSuccessfully: 'Deployment started',
    deploymentInfoError: 'Error fetching deployment info',
    deploymentInfoInspectDeployment: 'Inspect Deployment',
    deploymentInfoLatestDeployment: 'Latest Deployment',
    deploymentInfoNoAccess: 'You do not have permission to view deployments.',
    deploymentInfoNoTarget: 'No Vercel project selected.',
    deploymentInfoTitle: 'Deployments',
    deploymentInfoTriggerRedeploy: 'Redeploy',
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
