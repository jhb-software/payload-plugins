import type { Config, Field } from 'payload'

import type { AltTextPluginConfig, IncomingAltTextPluginConfig } from './types/AltTextPluginConfig'
import { altTextField } from './fields/altTextField'
import { keywordsField } from './fields/keywordsField'

/** Payload plugin which adds AI-powered alt text generation to upload collections. */
export const payloadAiAltTextPlugin =
  (pluginOptions: IncomingAltTextPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return config
    }

    const pluginConfig: AltTextPluginConfig = {
      enabled: pluginOptions.enabled ?? true,
      openAIApiKey: pluginOptions.openAIApiKey,
      collections: pluginOptions.collections,
      maxConcurrency: pluginOptions.maxConcurrency ?? 16,
      model: pluginOptions.model ?? 'gpt-4o-mini',
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
    }
  }
