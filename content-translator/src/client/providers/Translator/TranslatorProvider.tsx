import {
  toast,
  useAllFormFields,
  useConfig,
  useDocumentInfo,
  useForm,
  useLocale,
  useModal,
  useServerFunctions,
  useTranslation,
} from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'
import { type ReactNode, useEffect, useState } from 'react'

import type { TranslateArgs } from '../../../translate/types.js'
import type { TranslatorClientConfig } from '../../../types.js'

import { createClient } from '../../api/index.js'
import { type TranslationKey, TranslatorContext } from './context.js'

const modalSlug = 'translator-modal'

export const TranslatorProvider = ({ children }: { children: ReactNode }) => {
  const [data, dispatch] = useAllFormFields()

  const { getFormState } = useServerFunctions()

  const { id, collectionSlug, getDocPreferences, globalSlug } = useDocumentInfo()

  const { setModified } = useForm()

  const modal = useModal()

  const { t } = useTranslation()

  const locale = useLocale()

  const {
    config: {
      admin: { custom },
      localization,
      routes: { api },
      serverURL,
    },
  } = useConfig()

  const resolver = (custom as TranslatorClientConfig | undefined)?.translator?.resolver ?? null

  const translatorT = (key: TranslationKey) => {
    return t(`plugin-translator:${key}` as Parameters<typeof t>[0])
  }

  const apiClient = createClient({ api, serverURL })

  if (!localization) {
    throw new Error('Localization config is not provided and PluginTranslator is used')
  }

  const localesOptions = localization.locales.filter((each) => each.code !== locale.code)

  const [localeToTranslateFrom, setLocaleToTranslateFrom] = useState<string>('')

  useEffect(() => {
    const defaultFromOptions = localesOptions.find(
      (each) => localization.defaultLocale === each.code,
    )

    if (defaultFromOptions) {
      setLocaleToTranslateFrom(defaultFromOptions.code)
    } else if (localesOptions[0]) {
      setLocaleToTranslateFrom(localesOptions[0].code)
    }
  }, [locale, localesOptions, localization.defaultLocale])

  const closeTranslator = () => modal.closeModal(modalSlug)

  const submit = async ({ emptyOnly }: { emptyOnly: boolean }) => {
    if (!resolver) {
      return
    }

    const args: TranslateArgs = {
      id: id === null ? undefined : id,
      collectionSlug,
      data: reduceFieldsToValues(data, true),
      emptyOnly,
      globalSlug,
      locale: locale.code,
      localeFrom: localeToTranslateFrom,
    }

    const result = await apiClient.translate(args)

    if (!result.success) {
      toast.error(translatorT('errorMessage'))

      return
    }

    try {
      const { state } = await getFormState({
        collectionSlug,
        data: result.translatedData,
        docPermissions: {
          fields: true,
          update: true,
        },
        docPreferences: await getDocPreferences(),
        globalSlug,
        locale: locale.code,
        operation: 'update',
        renderAllFields: true,
        schemaPath: collectionSlug || globalSlug || '',
      })

      if (state) {
        dispatch({
          type: 'REPLACE_STATE',
          state,
        })

        setModified(true)
        toast.success(translatorT('successMessage'))
      }
    } catch (e) {
      console.error(e)
      toast.error(translatorT('errorMessage'))
    }

    closeTranslator()
  }

  return (
    <TranslatorContext
      value={{
        closeTranslator,
        localesOptions,
        localeToTranslateFrom,
        modalSlug,
        openTranslator: () => {
          modal.openModal(modalSlug)
        },
        resolver,
        setLocaleToTranslateFrom,
        submit,
        translatorT,
      }}
    >
      {children}
    </TranslatorContext>
  )
}
