import type { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Active Deployment',
    deploymentInfoDeploymentCompletedSuccessfully: 'New deployment completed successfully',
    deploymentInfoDeploymentTriggeredFailed: 'Failed to redeploy the latest production deployment',
    deploymentInfoDeploymentTriggeredSuccessfully:
      'Latest production deployment redeployed successfully',
    deploymentInfoDescription:
      'Since the website is static for performance reasons, a new deployment must be created when content changes in the CMS, rebuilding the website with the latest published content from the CMS. The build process usually takes 1-2 minutes.',
    deploymentInfoError: 'Error fetching deployment info',
    deploymentInfoInspectDeployment: 'Inspect Deployment',
    deploymentInfoLatestDeployment: 'Latest Deployment',
    deploymentInfoTitle: 'Vercel Deployments',
    deploymentInfoTriggerRedeploy: 'Redeploy Latest Production',

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
