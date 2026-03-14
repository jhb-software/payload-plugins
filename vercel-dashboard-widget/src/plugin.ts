import type { Config } from 'payload'

import type { VercelDashboardPluginConfig } from './types.js'

import { translations } from './translations/index.js'
import { deepMergeSimple } from './utilities/deepMergeSimple.js'

export const vercelDashboardPlugin =
  (pluginConfig: VercelDashboardPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginConfig.enabled === false) {
      return config
    }

    return {
      ...config,
      admin: {
        ...config.admin,
        dashboard: {
          ...config.admin?.dashboard,
          widgets: [
            ...(config.admin?.dashboard?.widgets ?? []),
            {
              slug: 'vercel-deployments',
              ComponentPath:
                '@jhb.software/payload-vercel-dashboard-widget/client#VercelDeploymentWidget',
              maxWidth: pluginConfig.widget?.maxWidth ?? 'full',
              minWidth: pluginConfig.widget?.minWidth ?? 'medium',
            },
          ],
        },
      },
      custom: {
        ...config.custom,
        // Make plugin config available for server actions
        vercelDashboardPluginConfig: pluginConfig,
      },
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, config.i18n?.translations ?? {}),
      },
    }
  }
