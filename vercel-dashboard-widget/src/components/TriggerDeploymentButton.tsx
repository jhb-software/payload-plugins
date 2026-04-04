'use client'
import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import React, { useCallback, useEffect, useRef, useTransition } from 'react'

import type { VercelDeployment } from '../utilities/vercelApiClient.js'

import { useDashboardTranslation } from '../react-hooks/useDashboardTranslation.js'
import { RefreshIcon } from './icons/refresh.js'
import { SpinnerIcon } from './icons/spinner.js'

export const TriggerFrontendDeploymentButton: React.FC = () => {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useDashboardTranslation()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const startPolling = useCallback(
    (deploymentId: string) => {
      // Clear any existing polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      const pollInterval = 5000 // 5 seconds
      let lastStatus: VercelDeployment['status']

      intervalRef.current = setInterval(() => {
        void fetch(`/api/vercel-dashboard/deployment-info?id=${encodeURIComponent(deploymentId)}`, {
          credentials: 'include',
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          })
          .then((deployment: { id: string; status: VercelDeployment['status'] }) => {
            if (deployment.status !== lastStatus) {
              lastStatus = deployment.status
              router.refresh()
            }

            if (deployment.status === 'READY') {
              if (intervalRef.current) clearInterval(intervalRef.current)
              intervalRef.current = null
              toast.success(t('vercel-dashboard:deploymentInfoDeploymentCompletedSuccessfully'))
            } else if (deployment.status === 'ERROR' || deployment.status === 'CANCELED') {
              if (intervalRef.current) clearInterval(intervalRef.current)
              intervalRef.current = null
              toast.error(t('vercel-dashboard:deploymentInfoDeploymentTriggeredFailed'))
            }
          })
          .catch((error) => {
            console.error('Error polling deployment status:', error)
          })
      }, pollInterval)
    },
    [router, t],
  )

  const handleClick = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/vercel-dashboard/trigger-deployment', {
          credentials: 'include',
          method: 'POST',
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `HTTP ${res.status}`)
        }

        const { id: deploymentId } = await res.json()
        toast.success(t('vercel-dashboard:deploymentInfoDeploymentTriggeredSuccessfully'))
        router.refresh()
        startPolling(deploymentId)
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
