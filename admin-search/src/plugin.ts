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
              // A server component, so it can evaluate `baseFilter` against the request
              // before handing the resulting constraint to the client search UI.
              path: '@jhb.software/payload-admin-search/rsc#SearchWrapper',
              serverProps: {
                style: headerSearchComponentStyle,
              },
            },
          ],
        },
      },
      // The action component is referenced by path and cannot close over the options, so
      // the server component reads them back from here.
      custom: {
        ...incomingConfig.custom,
        adminSearchPluginConfig: pluginOptions,
      },
      i18n: {
        ...incomingConfig.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
    }
  }
