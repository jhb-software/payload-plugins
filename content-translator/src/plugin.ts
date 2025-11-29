import type { Config, Plugin } from 'payload'

import { deepMerge } from 'payload/shared'

import type { TranslatorConfig } from './types.js'

import { CustomButton } from './client/components/CustomButton/index.js'
import { translations } from './i18n/translations.js'
import { translateEndpoint } from './translate/endpoint.js'

export const payloadContentTranslatorPlugin: (pluginConfig: TranslatorConfig) => Plugin = (
  pluginConfig,
) => {
  return (config) => {
    if (pluginConfig.enabled === false) {
      return config
    }

    if (!config.localization || config.localization.locales.length < 2) {
      console.warn(
        'Translator plugin requires localization to be enabled and at least two locales.',
      )
      return config
    }

    const updatedConfig: Config = {
      ...config,
      admin: {
        ...(config.admin ?? {}),
        custom: {
          ...(config.admin?.custom ?? {}),
          translator: {
            resolver: { key: pluginConfig.resolver.key },
          },
        },
      },
      collections:
        config.collections?.map((collection) => {
          if (!pluginConfig.collections.includes(collection.slug)) {
            return collection
          }

          return {
            ...collection,
            admin: {
              ...(collection.admin ?? {}),
              components: {
                ...(collection.admin?.components ?? {}),
                edit: {
                  ...(collection.admin?.components?.edit ?? {}),
                  PublishButton: CustomButton('publish'),
                  SaveButton: CustomButton('save'),
                },
              },
            },
          }
        }) ?? [],
      custom: {
        ...(config.custom ?? {}),
        translator: {
          resolver: pluginConfig.resolver,
        },
      },
      endpoints: [
        ...(config.endpoints ?? []),
        {
          handler: translateEndpoint,
          method: 'post',
          path: '/translator/translate',
        },
      ],
      globals:
        config.globals?.map((global) => {
          if (!pluginConfig.globals.includes(global.slug)) {
            return global
          }

          return {
            ...global,
            admin: {
              ...(global.admin ?? {}),
              components: {
                ...(global.admin?.components ?? {}),
                elements: {
                  ...(global.admin?.components?.elements ?? {}),
                  PublishButton: CustomButton('publish'),
                  SaveButton: CustomButton('save'),
                },
              },
            },
          }
        }) ?? [],
      i18n: {
        ...config.i18n,
        translations: {
          ...deepMerge(config.i18n?.translations ?? {}, translations),
        },
      },
    }

    return updatedConfig
  }
}
