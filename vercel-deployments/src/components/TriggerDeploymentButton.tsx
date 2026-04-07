'use client'
import { Button, toast } from '@payloadcms/ui'
import React, { useTransition } from 'react'

import { useDashboardTranslation } from '../react-hooks/useDashboardTranslation.js'
import { useDeploymentPoller } from './DeploymentStatusPoller.js'
import { RefreshIcon } from './icons/refresh.js'
import { SpinnerIcon } from './icons/spinner.js'

export const TriggerFrontendDeploymentButton: React.FC = () => {
  const [isPending, startTransition] = useTransition()
  const { t } = useDashboardTranslation()
  const { notifyBuildTriggered } = useDeploymentPoller()

  const handleClick = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/vercel-deployments', {
          credentials: 'include',
          method: 'POST',
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `HTTP ${res.status}`)
        }

        const { id: deploymentId } = await res.json()
        toast.success(t('vercel-dashboard:deploymentInfoDeploymentTriggeredSuccessfully'))
        notifyBuildTriggered(deploymentId)
      } catch (error) {
        toast.error(t('vercel-dashboard:deploymentInfoDeploymentTriggeredFailed'))
        console.error('Failed to redeploy website', error)
      }
    })
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
