'use client'
import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import React, { useTransition } from 'react'

import type { DeploymentInfo } from '../server-actions/getFrontendDeploymentInfo.js'
import type { VercelDeployment } from '../utilities/vercelApiClient.js'

import { useDashboardTranslation } from '../react-hooks/useDashboardTranslation.js'
import { RefreshIcon } from './icons/refresh.js'
import { SpinnerIcon } from './icons/spinner.js'

export const TriggerFrontendDeploymentButton: React.FC<{
  getDeploymentInfo: (deploymentId: string) => Promise<DeploymentInfo>
  triggerDeployment: () => Promise<string>
}> = ({ getDeploymentInfo, triggerDeployment }) => {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useDashboardTranslation()

  const handleClick = () => {
    startTransition(async () => {
      try {
        const deploymentId = await triggerDeployment()
        toast.success(t('vercel-dashboard:deploymentInfoDeploymentTriggeredSuccessfully'))

        // refresh the page so that the deployment info card re-fetches the latest deployment info
        router.refresh()

        startPolling(deploymentId)
      } catch (error) {
        toast.error(t('vercel-dashboard:deploymentInfoDeploymentTriggeredFailed'))
        console.error('Failed to redeploy website', error)
      }
    })
  }

  const startPolling = (deploymentId: string) => {
    const pollInterval = 5000 // 5 seconds

    let lastStatus: VercelDeployment['status']

    const interval = setInterval(() => {
      void getDeploymentInfo(deploymentId).then((deployment) => {
        if (deployment.status !== lastStatus) {
          lastStatus = deployment.status

          // refresh the page so that the deployment info card re-fetches the latest deployment info
          router.refresh()
        }

        if (deployment.status === 'READY') {
          clearInterval(interval)
          toast.success(t('vercel-dashboard:deploymentInfoDeploymentCompletedSuccessfully'))
        } else if (deployment.status === 'ERROR' || deployment.status === 'CANCELED') {
          clearInterval(interval)
          toast.error(t('vercel-dashboard:deploymentInfoDeploymentTriggeredFailed'))
        }
      })
    }, pollInterval)
  }

  return (
    <div>
      <Button buttonStyle="pill" margin={false} onClick={handleClick} type="button">
        <span style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
          {t('vercel-dashboard:deploymentInfoTriggerRedeploy')}
          {isPending ? <SpinnerIcon /> : <RefreshIcon />}
        </span>
      </Button>
    </div>
  )
}
