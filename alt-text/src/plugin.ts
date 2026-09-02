import type { Config, Widget } from 'payload'

import type {
  AltTextPluginConfig,
  IncomingAltTextPluginConfig,
} from './types/AltTextPluginConfig.js'

import { PLUGIN_SLUG } from './constants.js'
import { altTextHealthEndpoint } from './endpoints/altTextHealth.js'
import { bulkGenerateAltTextsEndpoint } from './endpoints/bulkGenerateAltTexts.js'
import { generateAltTextEndpoint } from './endpoints/generateAltText.js'
import { altTextField } from './fields/altTextField.js'
import { keywordsField } from './fields/keywordsField.js'
import {
  createRevalidateAltTextHealthAfterChangeHook,
  createRevalidateAltTextHealthAfterDeleteHook,
} from './hooks/revalidateAltTextHealth.js'
import { translations } from './translations/index.js'
import { isValidMimeType, normalizeCollectionsConfig } from './utilities/mimeTypes.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'

const altTextHealthWidgetDefinition = {
  slug: 'alt-text-health',
  // `Component` was renamed from `ComponentPath` in Payload 3.79.0. Set both for backward compatibility.
  Component: '@jhb.software/payload-alt-text-plugin/server#AltTextHealthWidget',
  ComponentPath: '@jhb.software/payload-alt-text-plugin/server#AltTextHealthWidget',
  label: {
    de: 'Alternativtexte Zustand',
    en: 'Alt text health',
  },
  maxWidth: 'full',
  minWidth: 'medium',
} satisfies { ComponentPath: string } & Widget

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

    const enableHealthCheck = incomingPluginConfig.healthCheck !== false

    const normalizedCollections = normalizeCollectionsConfig(incomingPluginConfig.collections, {
      imageThumbnailMimeType: incomingPluginConfig.imageThumbnailMimeType,
    })

    // A declared thumbnail MIME type replaces the per-document source check, so a
    // wrong one fails at boot rather than as a silently missing guard or a 500 per
    // image.
    const supportedMimeTypes = incomingPluginConfig.resolver.supportedMimeTypes
    for (const collection of normalizedCollections) {
      const declared = collection.imageThumbnailMimeType
      if (declared === undefined) {
        continue
      }

      if (!isValidMimeType(declared)) {
        throw new Error(
          `The alt-text plugin is configured with imageThumbnailMimeType "${declared}" for the "${collection.slug}" collection, ` +
            'but that is not a valid MIME type. Expected something like "image/webp".',
        )
      }

      if (supportedMimeTypes && !supportedMimeTypes.includes(declared)) {
        throw new Error(
          `The alt-text plugin is configured with imageThumbnailMimeType "${declared}" for the "${collection.slug}" collection, ` +
            `but the "${incomingPluginConfig.resolver.key}" resolver does not support it. ` +
            `Supported types: ${supportedMimeTypes.join(', ')}. ` +
            "Either change the transformation in getImageThumbnail, or remove the declaration to fall back to checking each document's own mime type.",
        )
      }
    }

    const access = incomingPluginConfig.access ?? (({ req }) => !!req.user)

    // A function form of `healthCheck` doubles as the health report's access
    // gate; otherwise it falls back to the shared `access`.
    const healthCheckAccess =
      typeof incomingPluginConfig.healthCheck === 'function'
        ? incomingPluginConfig.healthCheck
        : access

    const pluginConfig: AltTextPluginConfig = {
      access,
      collections: normalizedCollections,
      enabled: incomingPluginConfig.enabled ?? true,
      fieldsOverride: incomingPluginConfig.fieldsOverride,
      getImageThumbnail: incomingPluginConfig.getImageThumbnail,
      healthCheck: enableHealthCheck,
      healthCheckAccess,
      locale: incomingPluginConfig.locale,
      locales,
      maxBulkGenerateConcurrency: incomingPluginConfig.maxBulkGenerateConcurrency ?? 16,
      maxBulkGenerateIds: incomingPluginConfig.maxBulkGenerateIds ?? 100,
      resolver: incomingPluginConfig.resolver,
    }

    // Validate locale requirement for non-localized mode
    if (locales.length === 0 && !incomingPluginConfig.locale) {
      throw new Error(
        'The alt-text plugin requires a "locale" option when Payload localization is disabled. ' +
          'Please add { locale: "en" } (or your preferred locale) to your plugin configuration.',
      )
    }

    const collectionConfigBySlug = new Map<string, (typeof normalizedCollections)[number]>(
      normalizedCollections.map((entry) => [entry.slug, entry]),
    )

    // Collected while collections are mapped and flushed in `onInit`: no Payload instance —
    // and therefore no logger — exists while the config is still being built.
    const configWarnings: string[] = []

    // Ensure collections array exists
    config.collections = config.collections || []

    // Map over collections and inject AI alt text fields into specified ones
    config.collections = config.collections.map((collectionConfig) => {
      const altTextCollectionConfig = collectionConfigBySlug.get(collectionConfig.slug)

      if (altTextCollectionConfig) {
        if (!collectionConfig.upload) {
          configWarnings.push(
            `AI Alt Text Plugin: Collection "${collectionConfig.slug}" is not an upload collection. Skipping field injection.`,
          )
          return collectionConfig
        }

        const defaultFields = [
          altTextField({
            localized: Boolean(config.localization),
            // When the collection declares what getImageThumbnail delivers, the
            // document's own mime type says nothing about whether generation can
            // succeed — so don't let the admin UI disable the button on it.
            supportedMimeTypes: altTextCollectionConfig.imageThumbnailMimeType
              ? undefined
              : pluginConfig.resolver.supportedMimeTypes,
            trackedMimeTypes: altTextCollectionConfig.mimeTypes,
            validate: altTextCollectionConfig.validate,
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
            // enhance the search by adding the filename, keywords and alt fields (if the user has not provided their own listSearchableFields)
            listSearchableFields: collectionConfig.admin?.listSearchableFields ?? [
              'filename',
              'keywords',
              'alt',
            ],
          },
          fields: [...(collectionConfig.fields ?? []), ...fields],
          hooks: {
            ...collectionConfig.hooks,
            ...(enableHealthCheck && {
              afterChange: [
                ...(collectionConfig.hooks?.afterChange ?? []),
                createRevalidateAltTextHealthAfterChangeHook(collectionConfig.slug),
              ],
              afterDelete: [
                ...(collectionConfig.hooks?.afterDelete ?? []),
                createRevalidateAltTextHealthAfterDeleteHook(collectionConfig.slug),
              ],
            }),
          },
        }
      }

      return collectionConfig
    })

    const existingWidgets = config.admin?.dashboard?.widgets ?? []
    const widgets =
      !enableHealthCheck || existingWidgets.some((widget) => widget.slug === 'alt-text-health')
        ? existingWidgets
        : [...existingWidgets, altTextHealthWidgetDefinition]

    return {
      ...config,
      admin: {
        ...config.admin,
        dashboard: {
          ...config.admin?.dashboard,
          widgets,
        },
      },
      custom: {
        ...config.custom,
        // Make plugin config available in hooks/actions
        altTextPluginConfig: pluginConfig,
      },
      endpoints: [
        ...(config.endpoints ?? []),
        {
          handler: generateAltTextEndpoint(pluginConfig.access),
          method: 'post',
          path: `/${PLUGIN_SLUG}/generate`,
        },
        {
          handler: bulkGenerateAltTextsEndpoint(pluginConfig.access),
          method: 'post',
          path: `/${PLUGIN_SLUG}/generate/bulk`,
        },
        ...(enableHealthCheck
          ? [
              {
                handler: altTextHealthEndpoint(pluginConfig.healthCheckAccess),
                method: 'get' as const,
                path: `/${PLUGIN_SLUG}/health`,
              },
            ]
          : []),
      ],
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
      onInit: async (payload) => {
        for (const warning of configWarnings) {
          payload.logger.warn(warning)
        }

        await config.onInit?.(payload)
      },
    }
  }
