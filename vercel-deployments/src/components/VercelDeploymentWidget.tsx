import type { WidgetServerProps } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'
import type { WidgetTarget } from './DeploymentInfoCard.js'

import { resolveTarget } from '../utilities/resolveTarget.js'
import { DeploymentInfoCard } from './DeploymentInfoCard.js'

export type VercelDeploymentWidgetProps = WidgetServerProps

/** Main widget component that displays Vercel deployment information on the Payload dashboard. */
export const VercelDeploymentWidget = ({ req }: VercelDeploymentWidgetProps) => {
  const pluginConfig = req.payload.config.custom
    ?.vercelDeploymentsPluginConfig as VercelDeploymentsPluginConfig

  if (!pluginConfig) {
    throw new Error('Vercel Deployments plugin config not found in payload.config.custom')
  }

  // A statically configured target is handed over as-is, so the card renders it in its
  // first pass. A resolver is deliberately not awaited: the card renders right away and
  // only the parts that need the target suspend. A failing resolver (e.g. a cookie
  // pointing at a deleted tenant) becomes an error the card displays instead of taking
  // the dashboard down.
  const target: WidgetTarget =
    typeof pluginConfig.deploymentTarget === 'function'
      ? resolveTarget({ pluginConfig, req }).catch((error) => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          projectId: undefined,
        }))
      : pluginConfig.deploymentTarget

  return <DeploymentInfoCard i18n={req.i18n} pluginConfig={pluginConfig} target={target} />
}
