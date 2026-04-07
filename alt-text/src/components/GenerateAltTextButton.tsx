'use client'

import { Button, toast, useDocumentInfo, useField, useLocale, useTranslation } from '@payloadcms/ui'
import { useTransition } from 'react'

import type {
  PluginAltTextTranslationKeys,
  PluginAltTextTranslations,
} from '../translations/index.js'

import { Lightning } from './icons/Lightning.js'
import { Spinner } from './icons/Spinner.js'

export function GenerateAltTextButton() {
  const { t } = useTranslation<PluginAltTextTranslations, PluginAltTextTranslationKeys>()
  const { id, collectionSlug } = useDocumentInfo()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const { setValue: setKeywords } = useField<string>({ path: 'keywords' })
  const { setValue: setAltText } = useField<string>({ path: 'alt' })

  const handleGenerateAltText = () => {
    if (!collectionSlug || !id) {
      toast.error(t('@jhb.software/payload-alt-text-plugin:cannotGenerateMissingFields'))
      throw new Error('Missing required fields')
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/alt-text-plugin/generate', {
          body: JSON.stringify({
            id: id as string,
            collection: collectionSlug,
            locale: locale?.code ?? null, // sent null when localization is disabled
          }),
          method: 'POST',
        })

        if (!response.ok) {
          let errorMessage = t('@jhb.software/payload-alt-text-plugin:failedToGenerate')
          try {
            const errorData = (await response.json()) as { error: string }
            errorMessage = errorData.error
          } catch (error) {
            console.error('Error generating alt text:', error)
          }

          toast.error(errorMessage)
          return
        }

        const data = (await response.json()) as {
          altText: string
          keywords: string[]
        }

        if (data.altText && data.keywords) {
          setAltText(data.altText)
          setKeywords(data.keywords)
          toast.success(t('@jhb.software/payload-alt-text-plugin:altTextGeneratedSuccess'))
        } else {
          toast.error(t('@jhb.software/payload-alt-text-plugin:noAltTextGenerated'))
        }
      } catch (error) {
        console.error('Error generating alt text:', error)
        toast.error(t('@jhb.software/payload-alt-text-plugin:errorGeneratingAltText'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
      <div style={{ color: 'var(--theme-elevation-400)', flex: '1' }}>
        <p>{t('@jhb.software/payload-alt-text-plugin:altTextDescription')}</p>
        <ol style={{ margin: '10px 0', paddingLeft: '20px' }}>
          <li>{t('@jhb.software/payload-alt-text-plugin:altTextRequirement1')}</li>
          <li>{t('@jhb.software/payload-alt-text-plugin:altTextRequirement2')}</li>
          <li>{t('@jhb.software/payload-alt-text-plugin:altTextRequirement3')}</li>
        </ol>
      </div>
      <div style={{ alignItems: 'center', display: 'flex' }}>
        <Button
          disabled={isPending || !id}
          icon={isPending ? <Spinner /> : <Lightning />}
          onClick={handleGenerateAltText}
          tooltip={
            !id ? t('@jhb.software/payload-alt-text-plugin:pleaseSaveDocumentFirst') : undefined
          }
        >
          {t('@jhb.software/payload-alt-text-plugin:generateAltText')}
        </Button>
      </div>
    </div>
  )
}
