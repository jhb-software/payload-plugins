import type { Config, PayloadRequest, Widget, WidgetInstance } from 'payload'

import type {
  AltTextPluginConfig,
  IncomingAltTextPluginConfig,
} from './types/AltTextPluginConfig.js'

import { bulkGenerateAltTextsEndpoint } from './endpoints/bulkGenerateAltTexts.js'
import { generateAltTextEndpoint } from './endpoints/generateAltText.js'
import { altTextField } from './fields/altTextField.js'
import { keywordsField } from './fields/keywordsField.js'
import {
  createRevalidateAltTextHealthAfterChangeHook,
  createRevalidateAltTextHealthAfterDeleteHook,
} from './hooks/revalidateAltTextHealth.js'
import { translations } from './translations/index.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'

const altTextHealthWidgetDefinition: Widget = {
  slug: 'alt-text-health',
  ComponentPath: '@jhb.software/payload-alt-text-plugin/server#AltTextHealthWidget',
  label: {
    de: 'Alternativtexte Zustand',
    en: 'Alt text health',
  },
  maxWidth: 'full',
  minWidth: 'medium',
}

type DashboardDefaultLayout = Config['admin'] extends infer TAdmin
  ? TAdmin extends { dashboard?: infer TDashboard }
    ? TDashboard extends { defaultLayout?: infer TDefaultLayout }
      ? TDefaultLayout
      : never
    : never
  : never

const defaultAltTextHealthWidgetLayout: WidgetInstance = {
  widgetSlug: 'alt-text-health',
  width: 'full',
}

function appendAltTextHealthWidgetToLayout(layout: WidgetInstance[]): WidgetInstance[] {
  if (layout.some((widget) => widget.widgetSlug === 'alt-text-health')) {
    return layout
  }

  return [...layout, defaultAltTextHealthWidgetLayout]
}

function getDashboardDefaultLayout(defaultLayout: DashboardDefaultLayout | undefined) {
  if (!defaultLayout) {
    return [
      {
        widgetSlug: 'collections',
        width: 'full',
      },
      defaultAltTextHealthWidgetLayout,
    ] satisfies WidgetInstance[]
  }

  if (Array.isArray(defaultLayout)) {
    return appendAltTextHealthWidgetToLayout(defaultLayout)
  }

  return async ({ req }: { req: PayloadRequest }) =>
    appendAltTextHealthWidgetToLayout(await defaultLayout({ req }))
}

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
      resolver: incomingPluginConfig.resolver,
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
            afterChange: [
              ...(collectionConfig.hooks?.afterChange ?? []),
              createRevalidateAltTextHealthAfterChangeHook(collectionConfig.slug),
            ],
            afterDelete: [
              ...(collectionConfig.hooks?.afterDelete ?? []),
              createRevalidateAltTextHealthAfterDeleteHook(collectionConfig.slug),
            ],
          },
        }
      }

      return collectionConfig
    })

    const showHealthWidget = incomingPluginConfig.healthWidget !== false
    const existingWidgets = config.admin?.dashboard?.widgets ?? []
    const widgets =
      !showHealthWidget || existingWidgets.some((widget) => widget.slug === 'alt-text-health')
        ? existingWidgets
        : [...existingWidgets, altTextHealthWidgetDefinition]

    return {
      ...config,
      admin: {
        ...config.admin,
        dashboard: {
          ...config.admin?.dashboard,
          ...(showHealthWidget && {
            defaultLayout: getDashboardDefaultLayout(config.admin?.dashboard?.defaultLayout),
          }),
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
