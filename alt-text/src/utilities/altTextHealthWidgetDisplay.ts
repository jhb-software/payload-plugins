export type AltTextHealthWidgetDisplayState = 'healthy' | 'unavailable' | 'unhealthy'

export function getAltTextHealthWidgetDisplayState(
  collection: Pick<{ error?: unknown; missingDocs: number; partialDocs: number }, 'error' | 'missingDocs' | 'partialDocs'>,
): AltTextHealthWidgetDisplayState {
  if (collection.error) {
    return 'unavailable'
  }

  if (collection.missingDocs + collection.partialDocs > 0) {
    return 'unhealthy'
  }

  return 'healthy'
}
