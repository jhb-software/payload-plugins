'use client'

import { useRouter } from 'next/navigation.js'
import React, { createContext, use, useCallback, useEffect, useRef, useState } from 'react'

import type { DeploymentsInfo } from '../endpoints/getDeployments.js'
import type { VercelDeployment } from '../utilities/vercelApiClient.js'

import { hasDeploymentDataChanged } from './hasDeploymentDataChanged.js'

const IDLE_INTERVAL = 2 * 60 * 1000 // 2 minutes
const ACTIVE_INTERVAL = 5 * 1000 // 5 seconds

type PollerContextValue = {
  /** Notify the poller that a build was triggered with the given deployment ID */
  notifyBuildTriggered: (deploymentId: string) => void
}

const PollerContext = createContext<PollerContextValue>({
  notifyBuildTriggered: () => {},
})

export const useDeploymentPoller = () => use(PollerContext)

/**
 * Client component that polls deployment status in the background.
 * - Idle mode: polls every 2 minutes to detect external deployments
 * - Active mode: polls every 5 seconds when a build is in progress
 */
export const DeploymentStatusPoller: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter()
  const intervalRef = useRef<null | ReturnType<typeof setInterval>>(null)
  const activeDeploymentIdRef = useRef<null | string>(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const lastResponseRef = useRef<null | string>(null)

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (interval: number, pollFn: () => Promise<void>) => {
      clearPolling()
      // Run immediately, then on interval
      void pollFn()
      intervalRef.current = setInterval(() => {
        void pollFn()
      }, interval)
    },
    [clearPolling],
  )

  // Poll a specific deployment by ID (active build mode)
  const pollActiveDeployment = useCallback(async () => {
    const deploymentId = activeDeploymentIdRef.current
    if (!deploymentId) {
      return
    }

    try {
      const res = await fetch(`/api/vercel-deployments?id=${encodeURIComponent(deploymentId)}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        return
      }

      const responseText = await res.text()
      const deployment: { id: string; status: VercelDeployment['status'] } = JSON.parse(responseText)

      if (
        deployment.status === 'READY' ||
        deployment.status === 'ERROR' ||
        deployment.status === 'CANCELED'
      ) {
        // Build finished — switch back to idle polling
        activeDeploymentIdRef.current = null
        setIsBuilding(false)
      }

      if (hasDeploymentDataChanged(lastResponseRef.current, responseText)) {
        lastResponseRef.current = responseText
        router.refresh()
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [router])

  // Poll the list endpoint to detect any in-progress deployments (idle mode)
  const pollDeploymentsList = useCallback(async () => {
    try {
      const res = await fetch('/api/vercel-deployments', { credentials: 'include' })
      if (!res.ok) {
        return
      }

      const responseText = await res.text()
      const data: DeploymentsInfo = JSON.parse(responseText)

      // Detect if there's an active build we should track
      if (
        data.latestDeployment &&
        data.latestDeployment.uid !== data.lastReadyDeployment?.uid &&
        (data.latestDeployment.status === 'BUILDING' ||
          data.latestDeployment.status === 'INITIALIZING' ||
          data.latestDeployment.status === 'QUEUED')
      ) {
        // External build detected — switch to active polling
        activeDeploymentIdRef.current = data.latestDeployment.uid
        lastResponseRef.current = responseText
        setIsBuilding(true)
        return
      }

      if (hasDeploymentDataChanged(lastResponseRef.current, responseText)) {
        lastResponseRef.current = responseText
        router.refresh()
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [router])

  // Switch between idle and active polling based on build state
  useEffect(() => {
    if (isBuilding) {
      startPolling(ACTIVE_INTERVAL, pollActiveDeployment)
    } else {
      startPolling(IDLE_INTERVAL, pollDeploymentsList)
    }

    return clearPolling
  }, [isBuilding, startPolling, pollActiveDeployment, pollDeploymentsList, clearPolling])

  const notifyBuildTriggered = useCallback((deploymentId: string) => {
    activeDeploymentIdRef.current = deploymentId
    setIsBuilding(true)
  }, [])

  return <PollerContext value={{ notifyBuildTriggered }}>{children}</PollerContext>
}
