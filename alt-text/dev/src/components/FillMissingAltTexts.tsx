'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Demonstrates `onlyMissing` without `ids`, the way an external dashboard calls
 * it: the endpoint picks the next images with gaps in the selected tenant and
 * writes only their empty locales, keeping alt texts editors already wrote.
 */
export function FillMissingAltTexts() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()

  const fill = (collection: string) =>
    startTransition(async () => {
      const response = await fetch(`${serverURL ?? ''}${api}/alt-text/generate/bulk`, {
        body: JSON.stringify({ collection, limit: 5, onlyMissing: true }),
        method: 'POST',
      })
      const body = await response.json()

      if (!response.ok) {
        toast.error(body.error ?? 'Failed to fill missing alt texts')
        return
      }

      toast.success(
        `${collection}: filled ${body.updatedDocs} of ${body.totalDocs} picked images` +
          (body.erroredDocs.length ? `, ${body.erroredDocs.length} failed` : ''),
      )
      router.refresh()
    })

  return (
    <div style={{ display: 'flex', gap: 'var(--base)', marginBottom: 'var(--base)' }}>
      {['media', 'images'].map((collection) => (
        <Button
          buttonStyle="secondary"
          disabled={isPending}
          key={collection}
          onClick={() => fill(collection)}
          size="small"
        >
          Fill next 5 missing in {collection}
        </Button>
      ))}
    </div>
  )
}
