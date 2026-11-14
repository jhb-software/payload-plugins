import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { summarizeBulkGenerate } from '../src/components/summarizeBulkGenerate.ts'

/**
 * What a bulk run tells the editor once it finishes. Skipped files were never
 * candidates, so they are reported on their own terms and never counted as a
 * shortfall of the run — and a run left with nothing to attempt has no result
 * to report at all.
 */

const noneSkipped = { erroredDocs: [], skippedDocs: [] }

describe('the toasts a finished bulk run raises', () => {
  test('reports a run that updated everything it attempted as a success', () => {
    const toasts = summarizeBulkGenerate({ ...noneSkipped, totalDocs: 3, updatedDocs: 3 })

    assert.deepEqual(toasts, [
      {
        severity: 'success',
        translationKey: 'xOfYImagesUpdated',
        variables: { count: 3, total: 3, updated: 3 },
      },
    ])
  })

  test('warns when fewer images were updated than attempted', () => {
    const toasts = summarizeBulkGenerate({
      erroredDocs: ['doc-3'],
      skippedDocs: [],
      totalDocs: 3,
      updatedDocs: 2,
    })

    assert.deepEqual(toasts, [
      {
        severity: 'error',
        translationKey: 'failedToGenerateForXImages',
        variables: { count: 1 },
      },
      {
        severity: 'warning',
        translationKey: 'xOfYImagesUpdated',
        variables: { count: 3, total: 3, updated: 2 },
      },
    ])
  })

  test('leaves skipped files out of the count the run is measured against', () => {
    const toasts = summarizeBulkGenerate({
      erroredDocs: [],
      skippedDocs: [{ id: 'doc-2', reason: 'notTracked' }],
      totalDocs: 3,
      updatedDocs: 2,
    })

    const summary = toasts.find((toast) => toast.translationKey === 'xOfYImagesUpdated')

    // 2 of 2, not 2 of 3: the skipped file was never a candidate.
    assert.deepEqual(summary, {
      severity: 'success',
      translationKey: 'xOfYImagesUpdated',
      variables: { count: 2, total: 2, updated: 2 },
    })
  })

  test('reports no result for a run left with nothing to attempt', () => {
    const toasts = summarizeBulkGenerate({
      erroredDocs: [],
      skippedDocs: [
        { id: 'doc-1', reason: 'notTracked' },
        { id: 'doc-2', reason: 'unsupportedFormat' },
      ],
      totalDocs: 2,
      updatedDocs: 0,
    })

    // "0 of 0 images updated" reads as a failure of a run that never had work.
    assert.equal(
      toasts.some((toast) => toast.translationKey === 'xOfYImagesUpdated'),
      false,
    )
  })

  test('separates files needing no alt text from those an editor has to describe', () => {
    const toasts = summarizeBulkGenerate({
      erroredDocs: [],
      skippedDocs: [
        { id: 'doc-1', reason: 'notTracked' },
        { id: 'doc-2', reason: 'unsupportedFormat' },
        { id: 'doc-3', reason: 'unsupportedFormat' },
      ],
      totalDocs: 4,
      updatedDocs: 1,
    })

    assert.deepEqual(
      toasts.filter((toast) => toast.translationKey.startsWith('skipped')),
      [
        {
          severity: 'info',
          translationKey: 'skippedNoAltTextNeeded',
          variables: { count: 1 },
        },
        {
          severity: 'warning',
          translationKey: 'skippedUnsupportedFormat',
          variables: { count: 2 },
        },
      ],
    )
  })

  test('stays silent about failures, skips and results a run did not produce', () => {
    const toasts = summarizeBulkGenerate({ ...noneSkipped, totalDocs: 0, updatedDocs: 0 })

    assert.deepEqual(toasts, [])
  })
})
