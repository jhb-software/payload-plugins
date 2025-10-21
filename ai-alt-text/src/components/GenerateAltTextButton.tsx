'use client'

import { Button, toast, useDocumentInfo, useField, useLocale } from '@payloadcms/ui'
import { useTransition } from 'react'

import { generateAltText } from '../actions/generateAltText'

export function GenerateAltTextButton() {
  const { id, collectionSlug } = useDocumentInfo()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const { value: context } = useField<string | undefined>({ path: 'context' })
  const { setValue: setKeywords } = useField<string>({ path: 'keywords' })
  const { setValue: setAltText } = useField<string>({ path: 'alt' })

  const handleGenerateAltText = async () => {
    if (!collectionSlug || !id) {
      toast.error('Cannot generate alt text. Missing required fields.')
      throw new Error('Missing required fields')
    }

    startTransition(async () => {
      try {
        const data = await generateAltText({
          collection: collectionSlug,
          id: id as string,
          context,
          locale: locale.code,
        })

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
          icon={icon}
          tooltip={!id ? 'Please save the document first' : undefined}
        >
          AI-Generate Alt Text
        </Button>
      </div>
    </div>
  )
}
