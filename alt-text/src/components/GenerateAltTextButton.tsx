'use client'

import { Button, toast, useDocumentInfo, useField, useLocale } from '@payloadcms/ui'
import { useTransition } from 'react'

import { Lightning } from './icons/Lightning'
import { Spinner } from './icons/Spinner'

export function GenerateAltTextButton() {
  const { id, collectionSlug } = useDocumentInfo()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const { setValue: setKeywords } = useField<string>({ path: 'keywords' })
  const { setValue: setAltText } = useField<string>({ path: 'alt' })

  const handleGenerateAltText = async () => {
    if (!collectionSlug || !id) {
      toast.error('Cannot generate alt text. Missing required fields.')
      throw new Error('Missing required fields')
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/alt-text-plugin/generate-alt-text', {
          method: 'POST',
          body: JSON.stringify({
            collection: collectionSlug,
            id: id as string,
            locale: locale.code,
          }),
        })

        if (!response.ok) {
          let errorMessage = 'Failed to generate alt text. Please try again.'
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
          toast.success('Alt text generated successfully. Please review and save the document.')
        } else {
          toast.error('No alt text generated. Please try again.')
        }
      } catch (error) {
        console.error('Error generating alt text:', error)
        toast.error('Error generating alt text. Please try again.')
      }
    })
  }

  return (
    <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
      <div style={{ flex: '1', color: 'var(--theme-elevation-400)' }}>
        <p>
          Alternate text for the image. This will be used for screen readers and SEO. It should meet
          the following requirements:
        </p>
        <ol style={{ paddingLeft: '20px', margin: '10px 0' }}>
          <li>Briefly describe what is visible in the image in 1–2 sentences.</li>
          <li>
            Ensure it conveys the same information or purpose as the image, whenever possible.
          </li>
          <li>
            Avoid phrases like &quot;image of&quot; or &quot;picture of&quot; — screen readers
            already announce that it&quot;s an image.
          </li>
        </ol>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button
          onClick={handleGenerateAltText}
          disabled={isPending || !id}
          icon={isPending ? <Spinner /> : <Lightning />}
          tooltip={!id ? 'Please save the document first' : undefined}
        >
          Generate alt text
        </Button>
      </div>
    </div>
  )
}
