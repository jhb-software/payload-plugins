'use client'

import { useState } from 'react'
import { toast, useConfig } from '@payloadcms/ui'
import { usePluginTranslation } from '../utils/usePluginTranslations.js'

export const useCreateRedirect = (redirectsCollection: string = 'redirects') => {
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
      const response = await fetch(`${serverURL}${api}/${redirectsCollection}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourcePath,
          destinationPath,
          type: 'permanent',
          reason: t('redirectReasonSlugChange'),
        }),
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
