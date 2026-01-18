import { useTranslation } from '@payloadcms/ui'

import type {
  PluginAdminSearchTranslationKeys,
  PluginAdminSearchTranslations,
} from '../translations/index.js'

/** Hook which returns a translation function for the plugin translations. */
export const usePluginTranslation = () => {
  const { i18n } = useTranslation<PluginAdminSearchTranslations, PluginAdminSearchTranslationKeys>()
  const pluginTranslations = i18n.translations[
    '@jhb.software/payload-admin-search'
  ] as PluginAdminSearchTranslations

  return {
    t: (key: PluginAdminSearchTranslationKeys) => {
      if (!pluginTranslations) {
        return key
      }
      const translation = pluginTranslations[key] as string

      if (!translation) {
        // eslint-disable-next-line no-console
        console.error('Plugin translation not found', key)
      }
      return translation ?? key
    },
  }
}
