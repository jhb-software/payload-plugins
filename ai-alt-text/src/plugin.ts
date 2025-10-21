import type { Config, Field } from 'payload'

import type { AltTextPluginConfig, IncomingAltTextPluginConfig } from './types/AltTextPluginConfig'
import { altTextField } from './fields/altTextField'
import { keywordsField } from './fields/keywordsField'
import { generateAltTextEndpoint } from './endpoints/generateAltText'
import { bulkUpdateAltTextsEndpoint } from './endpoints/bulkUpdateAltTexts'

/** Payload plugin which adds AI-powered alt text generation to upload collections. */
export const payloadAiAltTextPlugin =
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
      maxConcurrency: incomingPluginConfig.maxConcurrency ?? 16,
      model: incomingPluginConfig.model ?? 'gpt-4.1-nano',
      locales: locales,
      getImageThumbnail: incomingPluginConfig.getImageThumbnail,
    }

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
                '@jhb.software/payload-ai-alt-text-plugin/client#BulkUpdateAltTextsButton',
              ],
            },
          },
          fields: [
            ...(collectionConfig.fields ?? []),
            altTextField({
              localized: true,
            }),
            keywordsField(),
          ],
        }
      }

      return collectionConfig
    })

    config.onInit = async (payload) => {
      if (incomingConfig.onInit) {
        await incomingConfig.onInit(payload)
      }
    }

    return {
      ...config,
      custom: {
        ...config.custom,
        // Make plugin config available in hooks/actions (like pages plugin does)
        aiAltTextPluginConfig: pluginConfig,
      },
      endpoints: [
        ...(config.endpoints ?? []),
        {
          path: '/ai-alt-text-plugin/generate-alt-text',
          method: 'post',
          handler: generateAltTextEndpoint,
        },
        {
          path: '/ai-alt-text-plugin/bulk-update-alt-texts',
          method: 'post',
          handler: bulkUpdateAltTextsEndpoint,
        },
      ],
    }
  }
