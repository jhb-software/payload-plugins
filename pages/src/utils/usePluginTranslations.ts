import { useTranslation } from '@payloadcms/ui'
import { PluginPagesTranslationKeys } from 'src/translations/index.js'
import { PluginPagesTranslations } from 'src/translations/index.js'

/** Hook which returns a translation function for the plugin translations. */
export const usePluginTranslation = () => {
  const { i18n } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()
  const pluginTranslations = i18n.translations[
    '@jhb.software/payload-pages-plugin'
  ] as PluginPagesTranslations

  return {
    t: (key: PluginPagesTranslationKeys) => {
      const translation = pluginTranslations[key] as string

      if (!translation) {
        console.log('Plugin translation not found', key)
      }
      return translation ?? key
    },
  }
}
