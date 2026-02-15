import type { CollectionAfterChangeHook } from 'payload'

export interface CapturedAfterChange {
  doc: Record<string, unknown>
  previousDoc: Record<string, unknown>
}

let capturedAfterChanges: CapturedAfterChange[] = []

export const clearCapturedAfterChanges = () => {
  capturedAfterChanges = []
}

/**
 * Returns the `{ doc, previousDoc }` received by the most recent afterChange hook invocation.
 * Call this after a `payload.create` or `payload.update` to inspect what user-defined
 * afterChange hooks would receive.
 */
export const getLastAfterChangeHookArgs = (): CapturedAfterChange => {
  if (capturedAfterChanges.length === 0) {
    throw new Error('No afterChange hook invocations captured. Did you forget to clear first?')
  }
  return capturedAfterChanges[capturedAfterChanges.length - 1]
}

export const captureAfterChangeDoc: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  capturedAfterChanges.push({ doc, previousDoc })
  return doc
}
