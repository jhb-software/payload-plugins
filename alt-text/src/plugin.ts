import type { Config } from 'payload'

import type {
  AltTextPluginConfig,
  IncomingAltTextPluginConfig,
} from './types/AltTextPluginConfig.js'
import { altTextField } from './fields/altTextField.js'
import { keywordsField } from './fields/keywordsField.js'
import { generateAltTextEndpoint } from './endpoints/generateAltText.js'
import { bulkGenerateAltTextsEndpoint } from './endpoints/bulkGenerateAltTexts.js'
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
      enabled: incomingPluginConfig.enabled ?? true,
      openAIApiKey: incomingPluginConfig.openAIApiKey,
      collections: incomingPluginConfig.collections,
      maxBulkGenerateConcurrency: incomingPluginConfig.maxBulkGenerateConcurrency ?? 16,
      model: incomingPluginConfig.model ?? 'gpt-4.1-nano',
      locales: locales,
      locale: incomingPluginConfig.locale,
      getImageThumbnail: incomingPluginConfig.getImageThumbnail,
      fieldsOverride: incomingPluginConfig.fieldsOverride,
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
          },
          fields: [...(collectionConfig.fields ?? []), ...fields],
        }
      }

      return collectionConfig
    })

    return {
      ...config,
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
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
