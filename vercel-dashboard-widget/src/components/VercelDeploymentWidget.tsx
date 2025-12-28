import type { WidgetServerProps } from 'payload'

import type { VercelDashboardPluginConfig } from '../types.js'

import { DeploymentInfoCard } from './cards/deployment-info/DeploymentInfoCard.js'

export type VercelDeploymentWidgetProps = WidgetServerProps

/** Main widget component that displays Vercel deployment information on the Payload dashboard. */
export const VercelDeploymentWidget = ({ req }: VercelDeploymentWidgetProps) => {
  const pluginConfig = req.payload.config.custom
    ?.vercelDashboardPluginConfig as VercelDashboardPluginConfig

  if (!pluginConfig) {
    throw new Error('Vercel Dashboard plugin config not found in payload.config.custom')
  }

  return <DeploymentInfoCard i18n={req.i18n} pluginConfig={pluginConfig} />
}
