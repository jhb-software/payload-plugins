'use client'

import { toast, useConfig } from '@payloadcms/ui'
import { useState } from 'react'

import { usePluginTranslation } from '../utils/usePluginTranslations.js'

export const useCreateRedirect = (redirectsCollectionSlug: string) => {
  const [isCreating, setIsCreating] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const { t } = usePluginTranslation()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()

  const createRedirect = async (sourcePath: string, destinationPath: string) => {
    setIsCreating(true)
    setIsSuccess(false)

    const loadingToast = toast.loading(t('creatingRedirect'))

    try {
      const response = await fetch(`${serverURL}${api}/${redirectsCollectionSlug}`, {
        body: JSON.stringify({
          type: 'permanent',
          destinationPath,
          reason: t('redirectReasonSlugChange'),
          sourcePath,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        toast.dismiss(loadingToast)
        toast.success(t('redirectCreatedSuccessfully'))
        setIsSuccess(true)
        return result.doc
      } else {
        throw new Error(result.errors?.[0]?.message || t('redirectCreationFailed'))
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      toast.error(t('redirectCreationFailed'), {
        description: error instanceof Error ? error.message : undefined,
      })
      throw error
    } finally {
      setIsCreating(false)
    }
  }

  return { createRedirect, isCreating, isSuccess }
}
