'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Demonstrates `onlyMissing` without `ids`: bulk generation picks the next
 * images with gaps in the selected tenant and writes only their empty locales,
 * keeping alt texts editors already wrote. The dev app's
 * `/fill-missing-alt-texts` endpoint runs it in-process via `bulkGenerateAltTexts`.
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
      const response = await fetch(`${serverURL ?? ''}${api}/fill-missing-alt-texts`, {
        body: JSON.stringify({ collection }),
        method: 'POST',
      })
      const body = await response.json()

      if (!response.ok) {
        // Payload renders an error thrown from a custom endpoint as `{ errors: [{ message }] }`.
        toast.error(body.errors?.[0]?.message ?? body.error ?? 'Failed to fill missing alt texts')
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
