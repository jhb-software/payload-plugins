import type { Config } from 'payload'

import type {
  AltTextPluginConfig,
  IncomingAltTextPluginConfig,
} from './types/AltTextPluginConfig.js'

import { bulkGenerateAltTextsEndpoint } from './endpoints/bulkGenerateAltTexts.js'
import { generateAltTextEndpoint } from './endpoints/generateAltText.js'
import { altTextField } from './fields/altTextField.js'
import { keywordsField } from './fields/keywordsField.js'
import { translations } from './translations/index.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'

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

    const pluginConfig: AltTextPluginConfig = {
      collections: incomingPluginConfig.collections,
      enabled: incomingPluginConfig.enabled ?? true,
      fieldsOverride: incomingPluginConfig.fieldsOverride,
      getImageThumbnail: incomingPluginConfig.getImageThumbnail,
      locale: incomingPluginConfig.locale,
      locales,
      maxBulkGenerateConcurrency: incomingPluginConfig.maxBulkGenerateConcurrency ?? 16,
      model: incomingPluginConfig.model ?? 'gpt-4.1-nano',
      openAIApiKey: incomingPluginConfig.openAIApiKey,
    }

    // Validate locale requirement for non-localized mode
    if (locales.length === 0 && !incomingPluginConfig.locale) {
      throw new Error(
        'The alt-text plugin requires a "locale" option when Payload localization is disabled. ' +
          'Please add { locale: "en" } (or your preferred locale) to your plugin configuration.',
      )
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
              // TODO: use the beforeBulkAction custom component slot once available: https://github.com/payloadcms/payload/pull/11719
              beforeListTable: [
                ...(collectionConfig.admin?.components?.beforeListTable ?? []),
                {
                  path: '@jhb.software/payload-alt-text-plugin/client#BulkGenerateAltTextsButton',
                  props: {
                    collectionSlug: collectionConfig.slug,
                  },
                },
              ],
            },
            listSearchableFields: [
              // enhance the search by adding the filename, keywords and alt fields (if not already included)
              ...(collectionConfig.admin?.listSearchableFields ?? []),
              ...(collectionConfig.admin?.listSearchableFields?.includes('filename')
                ? []
                : ['filename']),
              ...(collectionConfig.admin?.listSearchableFields?.includes('keywords')
                ? []
                : ['keywords']),
              ...(collectionConfig.admin?.listSearchableFields?.includes('alt') ? [] : ['alt']),
            ],
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
          handler: generateAltTextEndpoint,
          method: 'post',
          path: '/alt-text-plugin/generate-alt-text',
        },
        {
          handler: bulkGenerateAltTextsEndpoint,
          method: 'post',
          path: '/alt-text-plugin/bulk-generate-alt-texts',
        },
      ],
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
    }
  }
