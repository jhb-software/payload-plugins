import type { Config } from 'payload'

import type { VercelDeploymentsPluginConfig } from './types.js'

import { getDeploymentsEndpoint } from './endpoints/getDeployments.js'
import { triggerDeploymentEndpoint } from './endpoints/triggerDeployment.js'
import { translations } from './translations/index.js'
import { deepMergeSimple } from './utilities/deepMergeSimple.js'

export const vercelDeploymentsPlugin =
  (pluginConfig: VercelDeploymentsPluginConfig) =>
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
              Component:
                '@jhb.software/payload-vercel-deployments/client#VercelDeploymentWidget',
              maxWidth: pluginConfig.widget?.maxWidth ?? 'full',
              minWidth: pluginConfig.widget?.minWidth ?? 'medium',
            },
          ],
        },
      },
      custom: {
        ...config.custom,
        // Make plugin config available for endpoint handlers
        vercelDeploymentsPluginConfig: pluginConfig,
      },
      endpoints: [
        ...(config.endpoints ?? []),
        {
          handler: getDeploymentsEndpoint,
          method: 'get',
          path: '/vercel-deployments',
        },
        {
          handler: triggerDeploymentEndpoint,
          method: 'post',
          path: '/vercel-deployments',
        },
      ],
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, config.i18n?.translations ?? {}),
      },
    }
  }
