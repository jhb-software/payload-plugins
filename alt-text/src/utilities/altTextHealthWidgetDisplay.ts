import type { AltTextHealthWidgetCollection } from './altTextHealthContract.js'

export type AltTextHealthWidgetDisplayState = 'healthy' | 'unavailable' | 'unhealthy'

export function getAltTextHealthWidgetDisplayState(
  collection: Pick<AltTextHealthWidgetCollection, 'error' | 'invalidDocCount'>,
): AltTextHealthWidgetDisplayState {
  if (collection.error) {
    return 'unavailable'
  }

  if (collection.invalidDocCount > 0) {
    return 'unhealthy'
  }

  return 'healthy'
}
