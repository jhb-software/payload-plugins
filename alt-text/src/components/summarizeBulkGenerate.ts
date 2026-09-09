import type { SkippedDoc } from '../endpoints/bulkGenerateAltTexts.js'

export type BulkGenerateResult = {
  erroredDocs: (number | string)[]
  skippedDocs: SkippedDoc[]
  totalDocs: number
  updatedDocs: number
}

export type BulkGenerateToast = {
  severity: 'error' | 'info' | 'success' | 'warning'
  translationKey:
    | 'failedToGenerateForXImages'
    | 'skippedNoAltTextNeeded'
    | 'skippedUnsupportedFormat'
    | 'xOfYImagesUpdated'
  variables: { count: number; total?: number; updated?: number }
}

/**
 * What a finished bulk run tells the editor, in the order it is told.
 *
 * Skipped files were never candidates, so they are reported on their own terms
 * — by what the editor has to do about each — and left out of the count the run
 * is measured against. A run whose selection skipped away entirely has no
 * result to report: "0 of 0 images updated" reads as a failure of work that
 * never existed.
 */
export function summarizeBulkGenerate({
  erroredDocs,
  skippedDocs,
  totalDocs,
  updatedDocs,
}: BulkGenerateResult): BulkGenerateToast[] {
  const toasts: BulkGenerateToast[] = []

  if (erroredDocs.length > 0) {
    toasts.push({
      severity: 'error',
      translationKey: 'failedToGenerateForXImages',
      variables: { count: erroredDocs.length },
    })
  }

  const notTracked = skippedDocs.filter((doc) => doc.reason === 'notTracked').length
  const unsupported = skippedDocs.length - notTracked

  if (notTracked > 0) {
    toasts.push({
      severity: 'info',
      translationKey: 'skippedNoAltTextNeeded',
      variables: { count: notTracked },
    })
  }

  // Needs alt text, just not from a model — so it is the editor's to write.
  if (unsupported > 0) {
    toasts.push({
      severity: 'warning',
      translationKey: 'skippedUnsupportedFormat',
      variables: { count: unsupported },
    })
  }

  const attempted = totalDocs - skippedDocs.length

  if (attempted > 0) {
    toasts.push({
      severity: updatedDocs === attempted ? 'success' : 'warning',
      translationKey: 'xOfYImagesUpdated',
      variables: { count: attempted, total: attempted, updated: updatedDocs },
    })
  }

  return toasts
}
