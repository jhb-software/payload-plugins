import type { Config } from 'payload'

import { seoPlugin } from '@payloadcms/plugin-seo'
import { keywordsField } from './fields/keywordsField'
import type { SeoPluginConfig } from './types/SeoPluginConfig'
import { getGenerateMetaDescription } from './utils/generateMetaDescription'

/** Payload plugin which integrates additional seo capabilities to pages documents. */
export const payloadSeoPlugin =
  (pluginOptions: SeoPluginConfig) =>
  (incomingConfig: Config): Config => {
    let config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return config
    }

    const generateMetaDescriptionFunction = getGenerateMetaDescription(
      pluginOptions,
      incomingConfig,
    )

    const officialSeoPlugin = seoPlugin({
      ...pluginOptions,
      generateDescription: generateMetaDescriptionFunction,
      fields: ({ defaultFields }) => [
        keywordsField(),
        ...(pluginOptions.fields ? pluginOptions.fields({ defaultFields }) : defaultFields),
      ],
    })

    // Merge the config after the initialization of the official seo plugin with the incoming config
    config = { ...incomingConfig, ...officialSeoPlugin(incomingConfig) }

    config.onInit = async (payload) => {
      if (incomingConfig.onInit) {
        await incomingConfig.onInit(payload)
      }

      const neededEnvVars = ['OPENAI_API_KEY']

      const missingEnvVars = neededEnvVars.filter((envVar) => !process.env[envVar])
      if (missingEnvVars.length > 0) {
        throw new Error(
          `The following environment variables are required for the seo plugin but not defined: ${missingEnvVars.join(
            ', ',
          )}`,
        )
      }
    }

    return config
  }
