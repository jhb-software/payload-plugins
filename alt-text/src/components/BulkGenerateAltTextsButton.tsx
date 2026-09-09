'use client'

import { Button, toast, useAuth, useConfig, useSelection, useTranslation } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import { useTransition } from 'react'

import type {
  PluginAltTextTranslationKeys,
  PluginAltTextTranslations,
} from '../translations/index.js'
import type { BulkGenerateResult } from './summarizeBulkGenerate.js'

import { PLUGIN_SLUG } from '../constants.js'
import { Lightning } from './icons/Lightning.js'
import { Spinner } from './icons/Spinner.js'
import { summarizeBulkGenerate } from './summarizeBulkGenerate.js'

export function BulkGenerateAltTextsButton({ collectionSlug }: { collectionSlug: string }) {
  const { t } = useTranslation<PluginAltTextTranslations, PluginAltTextTranslationKeys>()
  const [isPending, startTransition] = useTransition()
  const { permissions } = useAuth()
  const { selected, setSelection } = useSelection()

  const canUpdateCollection = Boolean(permissions?.collections?.[collectionSlug]?.update)
  const {
    config: {
      routes: { api: apiRoute },
      serverURL,
    },
  } = useConfig()

  const selectedIds = Array.from(selected.entries())
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id) as string[]

  const router = useRouter()

  const handleGenerateAltTexts = () => {
    startTransition(async () => {
      if (!collectionSlug) {
        throw new Error('Collection slug is required')
      }

      try {
        const response = await fetch(`${serverURL ?? ''}${apiRoute}/${PLUGIN_SLUG}/generate/bulk`, {
          body: JSON.stringify({
            collection: collectionSlug,
            ids: selectedIds,
          }),
          method: 'POST',
        })

        if (!response.ok) {
          toast.error(t('@jhb.software/payload-alt-text-plugin:failedToGenerate'))
          return
        }

        const data = (await response.json()) as BulkGenerateResult

        for (const { severity, translationKey, variables } of summarizeBulkGenerate(data)) {
          toast[severity](t(`@jhb.software/payload-alt-text-plugin:${translationKey}`, variables))
        }

        // deselect all previously selected images
        for (const id of selectedIds) {
          setSelection(id)
        }

        router.refresh()
      } catch (error) {
        console.error('Error generating alt text:', error)
        toast.error(t('@jhb.software/payload-alt-text-plugin:errorGeneratingAltText'))
      }
    })
  }

  return (
    canUpdateCollection &&
    selectedIds.length > 0 && (
      <div className="m-0" style={{ display: 'flex', justifyContent: 'right' }}>
        <Button
          className="m-0"
          disabled={isPending || selectedIds.length === 0}
          icon={isPending ? <Spinner /> : <Lightning />}
          onClick={handleGenerateAltTexts}
        >
          {t('@jhb.software/payload-alt-text-plugin:generateAltTextFor', {
            count: selectedIds.length,
          })}
        </Button>
      </div>
    )
  )
}
