import type { Config } from 'payload'

import type { AdminSearchPluginConfig } from './types/AdminSearchPluginConfig.js'

import { translations } from './translations/index.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'

export const adminSearchPlugin =
  (pluginOptions: AdminSearchPluginConfig) =>
  (incomingConfig: Config): Config => {
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    const { headerSearchComponentStyle = 'button' } = pluginOptions

    return {
      ...incomingConfig,
      admin: {
        ...incomingConfig.admin,
        components: {
          ...incomingConfig.admin?.components,
          actions: [
            ...(incomingConfig.admin?.components?.actions || []),
            {
              clientProps: {
                style: headerSearchComponentStyle,
              },
              path: '@jhb.software/payload-admin-search/client#SearchWrapper',
            },
          ],
        },
      },
      i18n: {
        ...incomingConfig.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
    }
  }
