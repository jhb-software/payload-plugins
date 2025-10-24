import type { Config } from 'payload'

import type {
  AltTextPluginConfig,
  IncomingAltTextPluginConfig,
} from './types/AltTextPluginConfig.js'
import { altTextField } from './fields/altTextField.js'
import { keywordsField } from './fields/keywordsField.js'
import { generateAltTextEndpoint } from './endpoints/generateAltText.js'
import { bulkGenerateAltTextsEndpoint } from './endpoints/bulkGenerateAltTexts.js'

export const payloadAltTextPlugin =
  (incomingPluginConfig: IncomingAltTextPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (incomingPluginConfig.enabled === false) {
      return config
    }

    const locales = config.localization
      ? config.localization.locales.map((localeConfig) =>
          typeof localeConfig === 'string' ? localeConfig : localeConfig.code,
        )
      : []

    if (locales.length === 0) {
      throw new Error(
        'The alt text plugin currently only supports localized setups. If you need to use this plugin in a non-localized setup, please open an issue at https://github.com/jhb-software/payload-plugins.',
      )
    }

    const pluginConfig: AltTextPluginConfig = {
      enabled: incomingPluginConfig.enabled ?? true,
      openAIApiKey: incomingPluginConfig.openAIApiKey,
      collections: incomingPluginConfig.collections,
      maxBulkGenerateConcurrency: incomingPluginConfig.maxBulkGenerateConcurrency ?? 16,
      model: incomingPluginConfig.model ?? 'gpt-4.1-nano',
      locales: locales,
      getImageThumbnail: incomingPluginConfig.getImageThumbnail,
      fieldsOverride: incomingPluginConfig.fieldsOverride,
    }

    const defaultFields = [
      altTextField({
        localized: Boolean(config.localization),
      }),
      keywordsField({
        localized: Boolean(config.localization),
      }),
    ]

    const fields =
      incomingPluginConfig.fieldsOverride &&
      typeof incomingPluginConfig.fieldsOverride === 'function'
        ? incomingPluginConfig.fieldsOverride({ defaultFields })
        : defaultFields

    // Ensure collections array exists
    config.collections = config.collections || []

    // Map over collections and inject AI alt text fields into specified ones
    config.collections = config.collections.map((collectionConfig) => {
      if (pluginConfig.collections.includes(collectionConfig.slug)) {
        if (!collectionConfig.upload) {
          console.warn(
            `AI Alt Text Plugin: Collection "${collectionConfig.slug}" is not an upload collection. Skipping field injection.`,
          )
          return collectionConfig
        }

        return {
          ...collectionConfig,
          admin: {
            ...collectionConfig.admin,
            components: {
              ...(collectionConfig.admin?.components ?? {}),
              beforeListTable: [
                ...(collectionConfig.admin?.components?.beforeListTable ?? []),
                '@jhb.software/payload-alt-text-plugin/client#BulkGenerateAltTextsButton',
              ],
            },
          },
          fields: [...(collectionConfig.fields ?? []), ...fields],
        }
      }

      return collectionConfig
    })

    return {
      ...config,
      custom: {
        ...config.custom,
        // Make plugin config available in hooks/actions
        altTextPluginConfig: pluginConfig,
      },
      endpoints: [
        ...(config.endpoints ?? []),
        {
          path: '/alt-text-plugin/generate-alt-text',
          method: 'post',
          handler: generateAltTextEndpoint,
        },
        {
          path: '/alt-text-plugin/bulk-generate-alt-texts',
          method: 'post',
          handler: bulkGenerateAltTextsEndpoint,
        },
      ],
    }
  }
