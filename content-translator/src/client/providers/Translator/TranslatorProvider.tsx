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
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { TranslateResolver } from '../../../resolvers/types.js'
import type { TranslateArgs } from '../../../translate/types.js'

import { createClient } from '../../api/index.js'
import { TranslatorContext } from './context.js'

const modalSlug = 'translator-modal'

export const TranslatorProvider = ({ children }: { children: ReactNode }) => {
  const [resolver, setResolver] = useState<null | string>(null)

  const [data, dispatch] = useAllFormFields()

  const { getFormState } = useServerFunctions()

  const { id, collectionSlug, getDocPreferences, globalSlug } = useDocumentInfo()

  const { setModified } = useForm()

  const modal = useModal()

  const { t } = useTranslation()

  const resolverT = (
    key:
      | 'buttonLabel'
      | 'errorMessage'
      | 'modalDescription'
      | 'modalSourceLanguage'
      | 'modalTitle'
      | 'modalTranslating'
      | 'submitButtonLabelEmpty'
      | 'submitButtonLabelFull'
      | 'successMessage',
  ) => {
    if (!resolver) {
      return ''
    }

    return t(`plugin-translator:resolver_${resolver}_${key}` as Parameters<typeof t>[0])
  }

  const locale = useLocale()

  const {
    config: {
      admin: { custom },
      localization,
      routes: { api },
      serverURL,
    },
  } = useConfig()

  const apiClient = createClient({ api, serverURL })

  const resolverConfig = useMemo(() => {
    if (!resolver) {
      return null
    }

    const resolvers = (custom?.translator?.resolvers as TranslateResolver[]) || undefined

    if (!resolvers) {
      return null
    }

    const resolverConfig = resolvers.find((each) => each.key === resolver)

    return resolverConfig ?? null
  }, [custom, resolver])

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
    }
    setLocaleToTranslateFrom(localesOptions[0].code)
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
      resolver,
    }

    const result = await apiClient.translate(args)

    if (!result.success) {
      toast.error(resolverT('errorMessage'))

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
        toast.success(resolverT('successMessage'))
      }
    } catch (e) {
      console.error(e)
      toast.error(resolverT('errorMessage'))
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
        openTranslator: ({ resolverKey }) => {
          setResolver(resolverKey)
          modal.openModal(modalSlug)
        },
        resolver: resolverConfig,
        resolverT,
        setLocaleToTranslateFrom,
        submit,
      }}
    >
      {children}
    </TranslatorContext>
  )
}
