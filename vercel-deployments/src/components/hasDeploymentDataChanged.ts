/**
 * Compares two deployment API responses to determine if the data has changed.
 * Used by the poller to avoid unnecessary router.refresh() calls that would
 * disrupt the UI (especially in dashboard edit mode).
 */
export function hasDeploymentDataChanged(
  previousJson: null | string,
  currentJson: string,
): boolean {
  if (previousJson === null) {
    return true
  }
  return previousJson !== currentJson
}
