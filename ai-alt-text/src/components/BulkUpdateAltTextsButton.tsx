'use client'

import { Button, toast, useSelection } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Lightning } from './icons/Lightning'
import { Spinner } from './icons/Spinner'

export function BulkUpdateAltTextsButton() {
  const [isPending, startTransition] = useTransition()
  const { selected, setSelection } = useSelection()

  const selectedIds = Array.from(selected.entries())
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id) as string[]

  const router = useRouter()

  const handleGenerateAltTexts = async () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/ai-alt-text-plugin/bulk-update-alt-texts', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'media',
            ids: selectedIds,
          }),
        })

        if (!response.ok) {
          toast.error('Failed to generate alt text. Please try again.')
          return
        }

        const data = (await response.json()) as {
          updatedDocs: number
          totalDocs: number
          erroredDocs: string[]
        }

        if (data.erroredDocs.length > 0) {
          toast.error(`Failed to generate alt text for ${data.erroredDocs.length} images.`)
        }

        // in case not all images were updated, show a warning instead of a success message:
        if (data.updatedDocs === data.totalDocs) {
          toast.success(`${data.updatedDocs} of ${data.totalDocs} images updated.`)
        } else {
          toast.warning(`${data.updatedDocs} of ${data.totalDocs} images updated.`)
        }

        // deselect all previously selected images
        for (const id of selectedIds) {
          setSelection(id)
        }

        router.refresh()
      } catch (error) {
        console.error('Error generating alt text:', error)
        toast.error('Error generating alt text. Please try again.')
      }
    })
  }

  return (
    selectedIds.length > 0 && (
      <div style={{ display: 'flex', justifyContent: 'right' }} className="m-0">
        <Button
          onClick={handleGenerateAltTexts}
          disabled={isPending || selectedIds.length === 0}
          icon={isPending ? <Spinner /> : <Lightning />}
          className="m-0"
        >
          AI-Generate Alt Text for {selectedIds.length}{' '}
          {selectedIds.length === 1 ? 'image' : 'images'}
        </Button>
      </div>
    )
  )
}
