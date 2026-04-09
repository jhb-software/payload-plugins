import type { WidgetServerProps } from 'payload'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { DeploymentInfoCard } from './DeploymentInfoCard.js'

export type VercelDeploymentWidgetProps = WidgetServerProps

/** Main widget component that displays Vercel deployment information on the Payload dashboard. */
export const VercelDeploymentWidget = ({ req }: VercelDeploymentWidgetProps) => {
  const pluginConfig = req.payload.config.custom
    ?.vercelDeploymentsPluginConfig as VercelDeploymentsPluginConfig

  if (!pluginConfig) {
    throw new Error('Vercel Deployments plugin config not found in payload.config.custom')
  }

  return <DeploymentInfoCard i18n={req.i18n} pluginConfig={pluginConfig} />
}
