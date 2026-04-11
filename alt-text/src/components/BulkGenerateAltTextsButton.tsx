'use client'

import { Button, toast, useConfig, useSelection, useTranslation } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'
import { useTransition } from 'react'

import type {
  PluginAltTextTranslationKeys,
  PluginAltTextTranslations,
} from '../translations/index.js'

import { Lightning } from './icons/Lightning.js'
import { Spinner } from './icons/Spinner.js'

export function BulkGenerateAltTextsButton({ collectionSlug }: { collectionSlug: string }) {
  const { t } = useTranslation<PluginAltTextTranslations, PluginAltTextTranslationKeys>()
  const [isPending, startTransition] = useTransition()
  const { selected, setSelection } = useSelection()
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
        const response = await fetch(
          `${serverURL ?? ''}${apiRoute}/alt-text-plugin/generate/bulk`,
          {
            body: JSON.stringify({
              collection: collectionSlug,
              ids: selectedIds,
            }),
            method: 'POST',
          },
        )

        if (!response.ok) {
          toast.error(t('@jhb.software/payload-alt-text-plugin:failedToGenerate'))
          return
        }

        const data = (await response.json()) as {
          erroredDocs: string[]
          totalDocs: number
          updatedDocs: number
        }

        if (data.erroredDocs.length > 0) {
          toast.error(
            t('@jhb.software/payload-alt-text-plugin:failedToGenerateForXImages', {
              count: data.erroredDocs.length,
            }),
          )
        }

        // in case not all images were updated, show a warning instead of a success message:
        if (data.updatedDocs === data.totalDocs) {
          toast.success(
            t('@jhb.software/payload-alt-text-plugin:xOfYImagesUpdated', {
              total: data.totalDocs,
              updated: data.updatedDocs,
            }),
          )
        } else {
          toast.warning(
            t('@jhb.software/payload-alt-text-plugin:xOfYImagesUpdated', {
              total: data.totalDocs,
              updated: data.updatedDocs,
            }),
          )
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
