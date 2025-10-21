'use client'

import { Button, toast, useSelection } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { bulkUpdateAltTexts } from '../actions/bulkUpdateAltTexts'

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
        const { updatedDocs, totalDocs, erroredDocs } = await bulkUpdateAltTexts({
          collection: 'media',
          ids: selectedIds,
        })

        if (erroredDocs.length > 0) {
          toast.error(`Failed to generate alt text for ${erroredDocs.length} images.`)
        }

        // in case not all images were updated, show a warning instead of a success message:
        if (updatedDocs === totalDocs) {
          toast.success(`${updatedDocs} of ${totalDocs} images updated.`)
        } else {
          toast.warning(`${updatedDocs} of ${totalDocs} images updated.`)
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

  const icon = isPending ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      style={{
        height: '1rem',
        width: '1rem',
        animation: 'spin 1s linear infinite',
      }}
    >
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <circle
        style={{ opacity: 0.25 }}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        style={{ opacity: 0.75 }}
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      style={{
        height: '1rem',
        width: '1rem',
      }}
    >
      <path
        fillRule="evenodd"
        d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
        clipRule="evenodd"
      />
    </svg>
  )

  return (
    selectedIds.length > 0 && (
      <div style={{ display: 'flex', justifyContent: 'right' }} className="m-0">
        <Button
          onClick={handleGenerateAltTexts}
          disabled={isPending || selectedIds.length === 0}
          icon={icon}
          className="m-0"
        >
          AI-Generate Alt Text for {selectedIds.length}{' '}
          {selectedIds.length === 1 ? 'image' : 'images'}
        </Button>
      </div>
    )
  )
}
