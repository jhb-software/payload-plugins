'use client'

import { useState } from 'react'
import { toast, useConfig, useTranslation } from '@payloadcms/ui'
import { PluginPagesTranslationKeys, PluginPagesTranslations } from 'src/translations/index.js'

export const useCreateRedirect = (redirectsCollectionSlug: string) => {
  const [isCreating, setIsCreating] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()

  const createRedirect = async (sourcePath: string, destinationPath: string) => {
    setIsCreating(true)
    setIsSuccess(false)

    const loadingToast = toast.loading(t('@jhb.software/payload-pages-plugin:creatingRedirect'))

    try {
      const response = await fetch(`${serverURL}${api}/${redirectsCollectionSlug}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourcePath,
          destinationPath,
          type: 'permanent',
          reason: t('@jhb.software/payload-pages-plugin:redirectReasonSlugChange'),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.dismiss(loadingToast)
        toast.success(t('@jhb.software/payload-pages-plugin:redirectCreatedSuccessfully'))
        setIsSuccess(true)
        return result.doc
      } else {
        throw new Error(
          result.errors?.[0]?.message ||
            t('@jhb.software/payload-pages-plugin:redirectCreationFailed'),
        )
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      toast.error(t('@jhb.software/payload-pages-plugin:redirectCreationFailed'), {
        description: error instanceof Error ? error.message : undefined,
      })
      throw error
    } finally {
      setIsCreating(false)
    }
  }

  return { createRedirect, isCreating, isSuccess }
}
